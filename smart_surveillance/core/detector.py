import cv2
import time
from ultralytics import YOLO
from collections import defaultdict, deque
import math
import torch
import numpy as np


def run_behavior(video_path, cfg, stream=False):

    CONFIDENCE  = cfg.get("confidence", 0.35)
    INFER_WIDTH = 640
    INFER_EVERY = int(cfg.get("infer_every", 1))

    MIN_RUNNING_SPEED = cfg.get("min_running_speed", 2.5)
    MIN_DISTANCE_BL   = cfg.get("min_distance", 2.0)

    LOITER_TIME   = cfg.get("loiter_time", 10)
    LOITER_RADIUS = cfg.get("loiter_radius", 0.6)

    CONFIRM_FRAMES = 12
    EMA_ALPHA      = 0.15

    IDLE, POSSIBLE, RUNNING = 0, 1, 2

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    model = YOLO("yolov8s")
    try:
        model.fuse()
    except Exception:
        pass

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("ERROR: Cannot open video")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if fps > 0 else 25
    frame_time = 1.0 / fps
    video_spf  = 1.0 / fps

    print(f"[INFO] Video FPS: {fps:.1f}  target frame_time: {frame_time*1000:.1f} ms")

    # ── TRACKING DATA ─────────────────────────────────────────────────────────
    track_history   = defaultdict(lambda: deque(maxlen=int(fps * 15)))
    ema_speed_norm  = defaultdict(float)
    prev_speed_norm = defaultdict(float)
    distance_bl     = defaultdict(float)

    state         = defaultdict(lambda: IDLE)
    state_counter = defaultdict(int)

    loiter_start_frame = defaultdict(lambda: None)
    is_loitering       = defaultdict(lambda: False)
    frame_count        = 0

    # Cache of last-known annotations: list of (x1,y1,x2,y2,color,label)
    cached_boxes: list = []
    last_scale = 1.0

    def check_loitering(tid):
        history  = track_history[tid]
        required = int(fps * LOITER_TIME)
        if len(history) < required:
            return False
        points  = list(history)[-required:]
        avg_h   = max(1, np.mean([p[2] for p in points]))
        xs      = [p[0] for p in points]
        ys      = [p[1] for p in points]
        dx      = (max(xs) - min(xs)) / avg_h
        dy      = (max(ys) - min(ys)) / avg_h
        return math.sqrt(dx*dx + dy*dy) < LOITER_RADIUS

    # ── PLAYBACK CLOCK ────────────────────────────────────────────────────────
    playback_start_wall  = time.perf_counter()
    playback_start_frame = 0

    # ── MAIN LOOP ─────────────────────────────────────────────────────────────
    while True:
        frame_count += 1

        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            playback_start_wall  = time.perf_counter()
            playback_start_frame = frame_count
            continue

        # ── FPS LOCK ──────────────────────────────────────────────────────────
        frames_since_start = frame_count - playback_start_frame
        target_wall_time   = playback_start_wall + frames_since_start * frame_time
        now                = time.perf_counter()
        sleep_needed       = target_wall_time - now

        if sleep_needed > 0:
            time.sleep(sleep_needed)
        elif sleep_needed < -(frame_time * 2):
            cap.grab()
            frame_count += 1

        h, w = frame.shape[:2]

        # ── INFERENCE (only every INFER_EVERY frames) ─────────────────────────
        if frame_count % INFER_EVERY == 0:
            last_scale  = INFER_WIDTH / w
            infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * last_scale)))

            results = model.track(
                infer_frame,
                persist=True,
                classes=[0],
                conf=CONFIDENCE,
                device=DEVICE,
                imgsz=INFER_WIDTH,
                verbose=False,
            )

            # Rebuild cached_boxes from fresh results
            cached_boxes = []
            for r in results:
                if r.boxes.id is None:
                    continue

                for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                    x1, y1, x2, y2 = map(int, box)
                    x1 = int(x1 / last_scale);  x2 = int(x2 / last_scale)
                    y1 = int(y1 / last_scale);  y2 = int(y2 / last_scale)

                    tid   = int(tid)
                    cx    = (x1 + x2) // 2
                    cy    = y2
                    box_h = max(1, y2 - y1)

                    track_history[tid].append((cx, cy, box_h))

                    # ── NORMALISED SPEED ──────────────────────────────────────
                    speed_norm = 0.0
                    if len(track_history[tid]) >= 2:
                        px, py, ph = track_history[tid][-2]
                        pixel_dist = math.hypot(cx - px, cy - py)
                        avg_h      = max(1, (box_h + ph) / 2.0)
                        speed_norm = (pixel_dist / avg_h) / video_spf
                        distance_bl[tid] += pixel_dist / avg_h

                        prev_speed_norm[tid] = ema_speed_norm[tid]
                        ema_speed_norm[tid]  = (
                            EMA_ALPHA * speed_norm
                            + (1.0 - EMA_ALPHA) * ema_speed_norm[tid]
                        )

                    s = ema_speed_norm[tid]

                    # ── RUNNING STATE MACHINE ─────────────────────────────────
                    if state[tid] == IDLE:
                        if s > MIN_RUNNING_SPEED:
                            state[tid]         = POSSIBLE
                            state_counter[tid] = 1
                            distance_bl[tid]   = 0.0

                    elif state[tid] == POSSIBLE:
                        if s > MIN_RUNNING_SPEED:
                            state_counter[tid] += 1
                        else:
                            state[tid]         = IDLE
                            state_counter[tid] = 0
                            distance_bl[tid]   = 0.0

                        if (
                            state_counter[tid] >= CONFIRM_FRAMES
                            and distance_bl[tid] >= MIN_DISTANCE_BL
                        ):
                            state[tid] = RUNNING

                    elif state[tid] == RUNNING:
                        if s < MIN_RUNNING_SPEED * 0.55:
                            state[tid]         = IDLE
                            state_counter[tid] = 0
                            distance_bl[tid]   = 0.0

                    is_running = (state[tid] == RUNNING)

                    # ── LOITERING ─────────────────────────────────────────────
                    if check_loitering(tid):
                        if loiter_start_frame[tid] is None:
                            loiter_start_frame[tid] = frame_count
                        if (frame_count - loiter_start_frame[tid]) > fps * LOITER_TIME:
                            is_loitering[tid] = True
                    else:
                        loiter_start_frame[tid] = None
                        is_loitering[tid]       = False

                    # ── BUILD BOX ENTRY ───────────────────────────────────────
                    label = f"ID {tid}  {s:.1f} bl/s"
                    color = (0, 255, 0)

                    if is_running:
                        label = f"RUNNING  {s:.1f} bl/s"
                        color = (0, 0, 255)
                    elif is_loitering[tid]:
                        label = "LOITERING"
                        color = (255, 0, 0)

                    cached_boxes.append((x1, y1, x2, y2, color, label))

        # ── DRAW: always paint last-known boxes ───────────────────────────────
        for x1, y1, x2, y2, color, label in cached_boxes:
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        if stream:
            yield frame
        else:
            cv2.imshow("Behavior Monitoring", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
