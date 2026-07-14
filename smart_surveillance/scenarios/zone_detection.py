import cv2
import time
import numpy as np
from ultralytics import YOLO
from collections import defaultdict
import torch


def point_in_polygon(point: tuple, polygon: list) -> bool:
    """Ray-casting algorithm to check if a point is inside a polygon."""
    x, y = point
    n = len(polygon)
    inside = False
    px, py = polygon[0]
    for i in range(1, n + 1):
        qx, qy = polygon[i % n]
        if min(py, qy) < y <= max(py, qy):
            if x <= max(px, qx):
                if py != qy:
                    x_intersect = (y - py) * (qx - px) / (qy - py) + px
                if px == qx or x <= x_intersect:
                    inside = not inside
        px, py = qx, qy
    return inside


def run(video, cfg, stream=False):

    zone = cfg.get("zone")

    if not zone or len(zone) < 3:
        raise ValueError("Zone configuration missing or has fewer than 3 points")

    # polygon as list of (x, y) tuples
    polygon = [tuple(p) for p in zone]

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

    print(f"[INFO] Video FPS: {fps:.1f}  target frame_time: {frame_time*1000:.1f} ms")

    INFER_WIDTH         = 640
    ZONE_CONFIRM_FRAMES = 3  # consecutive frames to confirm zone entry

    # per-track zone confirmation buffer
    zone_buffer = defaultdict(int)

    # ── PLAYBACK CLOCK ────────────────────────────────────────────────────────
    playback_start_wall  = time.perf_counter()
    playback_start_frame = 0
    frame_count          = 0

    # pre-build numpy polygon for fillPoly (closed polygon overlay)
    poly_pts = np.array(polygon, dtype=np.int32)

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

        # ── INFERENCE ─────────────────────────────────────────────────────────
        h, w        = frame.shape[:2]
        scale       = INFER_WIDTH / w
        infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * scale)))

        results = model.track(
            infer_frame,
            persist=True,
            classes=[0],
            conf=0.35,
            device=DEVICE,
            imgsz=INFER_WIDTH,
            verbose=False,
        )

        # ── DRAW ZONE OVERLAY ─────────────────────────────────────────────────
        overlay = frame.copy()
        cv2.fillPoly(overlay, [poly_pts], (255, 50, 50))   # red tint fill
        cv2.addWeighted(overlay, 0.20, frame, 0.80, 0, frame)
        cv2.polylines(frame, [poly_pts], isClosed=True, color=(0, 100, 255), thickness=2)

        # label the zone
        label_x = int(np.mean([p[0] for p in polygon]))
        label_y = int(np.min([p[1] for p in polygon])) - 10
        cv2.putText(
            frame, "RESTRICTED ZONE", (label_x - 60, max(label_y, 15)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2,
        )

        for r in results:
            if r.boxes.id is None:
                continue

            for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                x1, y1, x2, y2 = map(int, box)
                # scale back to original frame dimensions
                x1 = int(x1 / scale);  x2 = int(x2 / scale)
                y1 = int(y1 / scale);  y2 = int(y2 / scale)

                tid = int(tid)

                # foot-point — same as line_crossing for consistency
                cx = (x1 + x2) // 2
                cy = y2

                in_zone = point_in_polygon((cx, cy), polygon)

                # ── ZONE CONFIRMATION BUFFER ───────────────────────────────
                if in_zone:
                    zone_buffer[tid] += 1
                else:
                    zone_buffer[tid] = 0

                is_restricted = zone_buffer[tid] >= ZONE_CONFIRM_FRAMES

                # ── DRAW ──────────────────────────────────────────────────
                if is_restricted:
                    color = (0, 0, 255)
                    label = f"ID {tid} - RESTRICTED"
                else:
                    color = (0, 255, 0)
                    label = f"ID {tid}"

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2,
                )
                # foot-point dot
                cv2.circle(frame, (cx, cy), 4, color, -1)

        # ── STREAM OR LOCAL WINDOW ────────────────────────────────────────────
        if stream:
            yield frame
        else:
            cv2.imshow("Zone Detection", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
