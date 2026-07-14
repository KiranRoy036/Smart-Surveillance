import cv2
import time
from ultralytics import YOLO
from collections import defaultdict
import torch


def side_of_line(p, a, b):
    """Return signed value indicating which side of line AB point P is on."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def _draw_annotations(frame, line_a, line_b, cached_boxes):
    """Draw the safety line + all cached bounding boxes onto frame in-place."""
    cv2.line(frame, line_a, line_b, (0, 255, 255), 2)
    for x1, y1, x2, y2, cx, cy, color, label in cached_boxes:
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
        cv2.circle(frame, (cx, cy), 4, color, -1)


def run(video, cfg, stream=False):

    line             = cfg.get("line")
    restricted_point = cfg.get("restricted_point")

    if line is None or restricted_point is None:
        raise ValueError("Line configuration missing")

    a = tuple(line[0])
    b = tuple(line[1])
    restricted_sign = side_of_line(tuple(restricted_point), a, b)

    # ── DEVICE ────────────────────────────────────────────────────────────────
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    # ── MODEL ─────────────────────────────────────────────────────────────────
    model = YOLO("yolov8s")
    try:
        model.fuse()
    except Exception:
        pass

    # ── VIDEO ─────────────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if fps > 0 else 25
    frame_time = 1.0 / fps

    INFER_WIDTH          = 640
    CROSS_CONFIRM_FRAMES = 3
    INFER_EVERY          = int(cfg.get("infer_every", 1))

    # Per-track crossing confirmation buffer
    cross_buffer = defaultdict(int)

    # Cache of last-known annotations: list of (x1,y1,x2,y2,cx,cy,color,label)
    cached_boxes: list = []
    # Keep scale from last infer frame so we can still use it on cached draw
    last_scale = 1.0

    # ── PLAYBACK CLOCK ────────────────────────────────────────────────────────
    playback_start_wall  = time.perf_counter()
    playback_start_frame = 0
    frame_count          = 0

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

        # ── INFERENCE (only every INFER_EVERY frames) ─────────────────────────
        h, w = frame.shape[:2]
        if frame_count % INFER_EVERY == 0:
            last_scale  = INFER_WIDTH / w
            infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * last_scale)))

            results = model.track(
                infer_frame,
                persist=True,
                classes=[0],
                conf=0.35,
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
                    tid = int(tid)
                    cx = (x1 + x2) // 2
                    cy = y2
                    person_sign = side_of_line((cx, cy), a, b)
                    if person_sign * restricted_sign > 0:
                        cross_buffer[tid] += 1
                    else:
                        cross_buffer[tid] = 0
                    is_restricted = cross_buffer[tid] >= CROSS_CONFIRM_FRAMES
                    color = (0, 0, 255) if is_restricted else (0, 255, 0)
                    label = f"ID {tid} - RESTRICTED" if is_restricted else f"ID {tid}"
                    cached_boxes.append((x1, y1, x2, y2, cx, cy, color, label))

        # ── DRAW: always draw safety line + last-known boxes ──────────────────
        _draw_annotations(frame, a, b, cached_boxes)

        # ── STREAM OR LOCAL WINDOW ────────────────────────────────────────────
        if stream:
            yield frame
        else:
            cv2.imshow("Metro Safety Monitoring", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
