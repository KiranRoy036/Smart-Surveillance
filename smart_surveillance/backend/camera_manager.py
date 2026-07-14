

from __future__ import annotations

import datetime
import hashlib
import math
import queue
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
MAX_CAMERAS     = 100
INFER_WIDTH     = 480       # inference resolution — less GPU work
ANNOTATE_WIDTH  = 640       # annotate at this width (downscaled from source)
JPEG_QUALITY    = 60
CONF            = 0.28
CLASSES         = [0]       # person only
RECONNECT_DELAY = 2.0

_infer_queue: queue.Queue = queue.Queue(maxsize=MAX_CAMERAS * 3)

_result_queues:  dict[str, queue.Queue]     = {}
_latest_frames:  dict[str, bytes | None]   = {}
_latest_hashes:  dict[str, bytes]          = {}   # for frame dedup in stream endpoint
_frame_locks:    dict[str, threading.Lock] = {}
_reader_stop:    dict[str, threading.Event] = {}
_annotator_stop: dict[str, threading.Event] = {}
_registry_lock = threading.Lock()

_jpeg_pool = ThreadPoolExecutor(max_workers=MAX_CAMERAS, thread_name_prefix="jpeg")

# ── Stats & Events ─────────────────────────────────────────────────────────────
_stats_lock = threading.Lock()
_global_stats: dict = {
    "events": deque(maxlen=100)
}
_camera_stats: dict[str, dict] = {}


def _add_event(camera_id: str, evt_type: str, message: str,
               severity: str = "info", vid_time: float = 0.0,
               cam_name: str = "Camera"):
    td = datetime.timedelta(seconds=int(vid_time))
    vid_time_str = str(td)
    with _stats_lock:
        _global_stats["events"].appendleft({
            "id":         str(uuid.uuid4()),
            "ts":         time.time(),          # raw Unix timestamp — formatted by browser
            "video_time": vid_time_str,
            "camera_id":  camera_id,
            "name":       cam_name,
            "type":       evt_type,
            "message":    message,
            "severity":   severity,
        })


def get_stats() -> dict:
    with _stats_lock:
        all_cams = list(_camera_stats.values())

        total_people   = sum(c.get("people_count", 0)    for c in all_cams)
        total_movers   = sum(c.get("active_movers", 0)   for c in all_cams)
        total_runners  = sum(c.get("active_runners", 0)  for c in all_cams)
        total_loiters  = sum(c.get("active_loiterers", 0) for c in all_cams)

        recent_alerts = sum(len(c.get("alerts", [])) for c in all_cams)
        safety_score  = max(0, 100 - recent_alerts * 5)

        activity_level = int((total_movers / total_people) * 100) if total_people else 0

        if total_people > 0:
            conf_run    = int((total_runners  / total_people) * 100)
            conf_loiter = int((total_loiters  / total_people) * 100)
            conf_normal = max(0, 100 - conf_run - conf_loiter)
        else:
            conf_normal, conf_loiter, conf_run = 100, 0, 0

        return {
            "peopleCount":   total_people,
            "safetyScore":   safety_score,
            "activityLevel": activity_level,
            "events":        list(_global_stats["events"]),
            "behavior": {
                "normal":        conf_normal,
                "loitering":     conf_loiter,
                "fast_movement": conf_run,
            },
            "reports": [],  # reports removed — detection never stops
        }


# ── YOLO model ─────────────────────────────────────────────────────────────────
_model:            YOLO | None = None
_model_lock                    = threading.Lock()
_device: str                   = "cuda" if torch.cuda.is_available() else "cpu"
_infer_started                 = False
_infer_start_lock              = threading.Lock()


def _get_model() -> YOLO:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                print(f"[camera_manager] Loading YOLOv8s on {_device} imgsz={INFER_WIDTH}...")
                _model = YOLO("yolov8s")
                try:
                    _model.fuse()
                except Exception:
                    pass
                print("[camera_manager] Model ready.")
    return _model


# ── Centroid tracker ───────────────────────────────────────────────────────────

class _CentroidTracker:
    def __init__(self, max_lost: int = 15):
        self.next_id  = 1
        self.objects: dict[int, np.ndarray] = {}
        self.lost:    dict[int, int]         = {}
        self.max_lost = max_lost

    def update(self, boxes: list) -> list:
        if not boxes:
            for tid in list(self.lost):
                self.lost[tid] += 1
                if self.lost[tid] > self.max_lost:
                    del self.objects[tid]
                    del self.lost[tid]
            return []

        new_c = np.array(
            [[(x1+x2)/2, (y1+y2)/2, x2-x1, y2-y1] for x1,y1,x2,y2 in boxes],
            dtype=float,
        )

        if not self.objects:
            result = []
            for i, (x1,y1,x2,y2) in enumerate(boxes):
                tid = self.next_id; self.next_id += 1
                self.objects[tid] = new_c[i]; self.lost[tid] = 0
                result.append((x1,y1,x2,y2,tid))
            return result

        obj_ids = list(self.objects.keys())
        obj_c   = np.array([self.objects[t] for t in obj_ids])

        cost = np.zeros((len(obj_ids), len(new_c)))
        for i, oc in enumerate(obj_c):
            for j, nc in enumerate(new_c):
                d     = math.hypot(oc[0]-nc[0], oc[1]-nc[1])
                avg_h = max(1, (oc[3]+nc[3])/2)
                cost[i,j] = d / avg_h

        matched_o: set[int] = set()
        matched_n: set[int] = set()
        pairs: list = []
        for oi, ni in sorted(np.ndindex(cost.shape), key=lambda ij: cost[ij]):
            if oi in matched_o or ni in matched_n:
                continue
            if cost[oi, ni] < 1.5:
                pairs.append((oi, ni))
                matched_o.add(oi); matched_n.add(ni)

        result = []
        for oi, ni in pairs:
            tid = obj_ids[oi]
            self.objects[tid] = new_c[ni]; self.lost[tid] = 0
            x1,y1,x2,y2 = boxes[ni]
            result.append((x1,y1,x2,y2,tid))

        for oi, tid in enumerate(obj_ids):
            if oi not in matched_o:
                self.lost[tid] = self.lost.get(tid,0) + 1
                if self.lost[tid] > self.max_lost:
                    del self.objects[tid]; del self.lost[tid]

        for ni, box in enumerate(boxes):
            if ni not in matched_n:
                tid = self.next_id; self.next_id += 1
                x1,y1,x2,y2 = box
                self.objects[tid] = new_c[ni]; self.lost[tid] = 0
                result.append((x1,y1,x2,y2,tid))

        return result


# ── Spatial helpers ────────────────────────────────────────────────────────────

def _side_of_line(p, a, b):
    return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])


def _point_in_polygon(point, polygon):
    x, y = point; inside = False
    px, py = polygon[0]
    for i in range(1, len(polygon)+1):
        qx, qy = polygon[i % len(polygon)]
        if min(py,qy) < y <= max(py,qy) and x <= max(px,qx):
            xi = (y-py)*(qx-px)/(qy-py)+px if qy != py else px
            if px == qx or x <= xi:
                inside = not inside
        px, py = qx, qy
    return inside


# ── Inference thread ───────────────────────────────────────────────────────────

def _inference_thread_fn():
    model = _get_model()
    print("[InferenceThread] running")
    while True:
        try:
            item = _infer_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        if item is None:
            break

        camera_id, infer_frame, ann_frame, scale_ann, cfg, vid_time = item
        try:
            results = model.predict(
                infer_frame,
                classes=CLASSES,
                conf=CONF,
                iou=0.50,
                device=_device,
                imgsz=INFER_WIDTH,
                verbose=False,
            )
        except Exception as exc:
            print(f"[InferenceThread] error: {exc}")
            results = []

        rq = _result_queues.get(camera_id)
        if rq is not None:
            if rq.full():
                try: rq.get_nowait()
                except queue.Empty: pass
            try: rq.put_nowait((ann_frame, scale_ann, results, cfg, vid_time))
            except queue.Full: pass

        _infer_queue.task_done()


def _ensure_infer_thread():
    global _infer_started
    with _infer_start_lock:
        if not _infer_started:
            threading.Thread(
                target=_inference_thread_fn,
                name="infer-thread", daemon=True,
            ).start()
            _infer_started = True


# ── Frame reader thread ────────────────────────────────────────────────────────

def _reader_thread_fn(camera_id: str, cfg: dict, stop: threading.Event):
    video       = cfg.get("video", 0)
    infer_every = max(1, int(cfg.get("infer_every", 3)))

    print(f"[Reader:{camera_id[:8]}] opening {video}  infer_every={infer_every}")

    while not stop.is_set():
        cap = cv2.VideoCapture(video if isinstance(video, int) else str(video))
        if not cap.isOpened():
            print(f"[Reader:{camera_id[:8]}] cannot open, retry in {RECONNECT_DELAY}s")
            time.sleep(RECONNECT_DELAY)
            continue

        fps         = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_t     = 1.0 / fps
        frame_count = 0
        wall_start  = time.perf_counter()
        frame_base  = 0

        while not stop.is_set():
            frame_count += 1
            ret, frame = cap.read()
            if not ret:
                # Always loop — whether file or webcam
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                wall_start  = time.perf_counter()
                frame_base  = frame_count
                # Signal annotator to reset event_fired on next frame
                with _stats_lock:
                    if camera_id in _camera_stats:
                        _camera_stats[camera_id]["loop_reset"] = True
                continue

            elapsed = frame_count - frame_base
            target  = wall_start + elapsed * frame_t
            sleep_n = target - time.perf_counter()
            if sleep_n > 0:
                time.sleep(sleep_n)
            elif sleep_n < -(frame_t * 2):
                cap.grab(); frame_count += 1

            if frame_count % infer_every == 0:
                h, w = frame.shape[:2]

                # Two-stage resize: source → ANNOTATE_WIDTH → INFER_WIDTH
                ann_scale = ANNOTATE_WIDTH / w
                ann_frame = cv2.resize(frame, (ANNOTATE_WIDTH, int(h * ann_scale)))

                inf_scale = INFER_WIDTH / ANNOTATE_WIDTH
                inf_frame = cv2.resize(ann_frame, (INFER_WIDTH, int(ann_frame.shape[0] * inf_scale)))

                pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
                vid_time = pos_msec / 1000.0 if pos_msec else (frame_count / fps)

                try:
                    _infer_queue.put_nowait(
                        (camera_id, inf_frame, ann_frame, ann_scale, cfg, vid_time)
                    )
                except queue.Full:
                    pass

        cap.release()
        if not stop.is_set():
            time.sleep(RECONNECT_DELAY)

    print(f"[Reader:{camera_id[:8]}] exited")


# ── JPEG encode + store (hash dedup) ──────────────────────────────────────────

def _encode_and_store(frame: np.ndarray, camera_id: str, lk: threading.Lock):
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if ok:
        b = buf.tobytes()
        with lk:
            _latest_frames[camera_id] = b
            _latest_hashes[camera_id] = hashlib.md5(b).digest()


# ── Annotator thread ───────────────────────────────────────────────────────────

def _annotator_thread_fn(camera_id: str, scenario: str, cfg: dict,
                         stop: threading.Event):
    line             = cfg.get("line")
    restricted_point = cfg.get("restricted_point")
    zone             = cfg.get("zone", [])
    fps              = float(cfg.get("fps", 25))
    cam_name         = cfg.get("camera_name", cfg.get("name", "Camera"))

    video    = cfg.get("video", 0)

    a = b = r_sign = None
    if line and restricted_point:
        a = tuple(line[0]); b = tuple(line[1])
        r_sign = _side_of_line(tuple(restricted_point), a, b)

    tracker   = _CentroidTracker(max_lost=int(fps * 1.5))
    cross_buf = defaultdict(int)
    zone_buf  = defaultdict(int)

    # ── Behaviour tuning ──────────────────────────────────────────────────────
    EMA_A        = 0.10
    CONFIRM      = int(fps * 1.5)
    MIN_SPD      = float(cfg.get("min_running_speed", 4.0))
    MIN_DIST     = float(cfg.get("min_distance", 4.0))
    WALK_SPD     = MIN_SPD * 0.55
    RUN_EXIT_SPD = MIN_SPD * 0.45
    SPIKE_MULT   = 4.0
    LOITER_TIME  = float(cfg.get("loiter_time", 10))
    LOITER_RAD   = float(cfg.get("loiter_radius", 0.8))
    IDLE, WALK, POS, RUN = 0, 1, 2, 3

    t_hist           = defaultdict(lambda: deque(maxlen=int(fps * 30)))
    ema_spd          = defaultdict(float)
    dist_bl          = defaultdict(float)
    r_state          = defaultdict(lambda: IDLE)
    r_cnt            = defaultdict(int)
    loitering        = defaultdict(bool)
    loiter_wall_start: dict[int, float] = {}
    event_fired      = defaultdict(bool)  # for stats events

    rq = _result_queues[camera_id]
    lk = _frame_locks[camera_id]

    zone_pts_np      = np.array(zone, dtype=np.int32) if len(zone) >= 3 else None
    scaled_zone_list: list = []

    # Initialise per-camera stats entry
    with _stats_lock:
        _camera_stats[camera_id] = {
            "name":             cam_name,
            "people_count":     0,
            "active_movers":    0,
            "active_runners":   0,
            "active_loiterers": 0,
            "alerts":           deque(maxlen=20),
            "cum_people":       0,
            "cum_movers":       0,
            "cum_runners":      0,
            "cum_loiterers":    0,
            "frames_processed": 0,
            "total_alerts_fired": 0,
            "loop_reset":       False,
        }

    while not stop.is_set():
        try:
            item = rq.get(timeout=0.5)
        except queue.Empty:
            continue

        ann_frame, ann_scale, results, _, vid_time = item

        # Check if reader signalled a video loop restart → reset event dedup
        with _stats_lock:
            if camera_id in _camera_stats and _camera_stats[camera_id].get("loop_reset"):
                _camera_stats[camera_id]["loop_reset"] = False
                event_fired.clear()

        infer_to_ann = ANNOTATE_WIDTH / INFER_WIDTH

        boxes_raw = []
        for r in results:
            if not hasattr(r, "boxes") or r.boxes is None:
                continue
            for box in r.boxes.xyxy:
                x1,y1,x2,y2 = map(int, box)
                x1=int(x1*infer_to_ann); x2=int(x2*infer_to_ann)
                y1=int(y1*infer_to_ann); y2=int(y2*infer_to_ann)
                boxes_raw.append((x1,y1,x2,y2))

        tracked = tracker.update(boxes_raw)

        def sc(v):
            return int(v * ann_scale)

        # ── Scenario overlays ─────────────────────────────────────────────────
        if scenario == "metro_line" and a and b:
            pa = (sc(a[0]), sc(a[1])); pb = (sc(b[0]), sc(b[1]))
            cv2.line(ann_frame, pa, pb, (0,255,255), 1)

        if scenario == "zone_detection" and zone_pts_np is not None:
            if not scaled_zone_list:
                scaled_zone_list = [(int(p[0]*ann_scale), int(p[1]*ann_scale)) for p in zone]
            sz = (zone_pts_np * ann_scale).astype(np.int32)
            ov = ann_frame.copy()
            cv2.fillPoly(ov, [sz], (0,0,180))
            cv2.addWeighted(ov, 0.18, ann_frame, 0.82, 0, ann_frame)
            cv2.polylines(ann_frame, [sz], True, (0,0,255), 1)
            cv2.putText(ann_frame, "RESTRICTED ZONE", tuple(sz[0]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,0,255), 1)

        now_wall = time.time()
        movers   = 0
        runners  = 0
        loiterers = 0
        # For non-behavior scenarios, count all tracked people as movers
        # (they are all in motion relative to the camera scene)
        if scenario != "behavior":
            movers = len(tracked)

        for (x1,y1,x2,y2,tid) in tracked:
            cx    = (x1+x2)//2
            cy    = y2
            box_h = max(1, y2-y1)

            if scenario == "metro_line" and a and b:
                pa = (sc(a[0]), sc(a[1])); pb = (sc(b[0]), sc(b[1]))
                pr = (sc(restricted_point[0]), sc(restricted_point[1]))
                r_sign_s = _side_of_line(pr, pa, pb)
                sign     = _side_of_line((cx,cy), pa, pb)
                if r_sign_s and sign * r_sign_s > 0:
                    cross_buf[tid] += 1
                else:
                    cross_buf[tid]  = 0
                alert = cross_buf[tid] >= 3
                if alert and not event_fired[tid]:
                    _add_event(camera_id, "Security Alert",
                               "Individual crossed restricted line.", "error", vid_time, cam_name)
                    event_fired[tid] = True
                    with _stats_lock:
                        if camera_id in _camera_stats:
                            _camera_stats[camera_id]["alerts"].append(time.time())
                            _camera_stats[camera_id]["total_alerts_fired"] += 1
                color = (0,0,255) if alert else (0,255,0)
                label = f"#{tid} ALERT" if alert else f"#{tid}"

            elif scenario == "zone_detection" and zone_pts_np is not None:
                if not scaled_zone_list:
                    scaled_zone_list = [(int(p[0]*ann_scale), int(p[1]*ann_scale)) for p in zone]
                if _point_in_polygon((cx,cy), scaled_zone_list):
                    zone_buf[tid] += 1
                else:
                    zone_buf[tid]  = 0
                alert = zone_buf[tid] >= 3
                if alert and not event_fired[tid]:
                    _add_event(camera_id, "Security Alert",
                               "Unauthorized presence in restricted zone.", "error", vid_time, cam_name)
                    event_fired[tid] = True
                    with _stats_lock:
                        if camera_id in _camera_stats:
                            _camera_stats[camera_id]["alerts"].append(time.time())
                            _camera_stats[camera_id]["total_alerts_fired"] += 1
                color = (0,0,255) if alert else (0,255,0)
                label = f"#{tid} ALERT" if alert else f"#{tid}"

            else:
                # ── Behaviour detection ──────────────────────────────────────
                t_hist[tid].append((cx, cy, box_h, now_wall))

                spd = 0.0
                if len(t_hist[tid]) >= 2:
                    px,py,ph,_ = t_hist[tid][-2]
                    d     = math.hypot(cx-px, cy-py)
                    avg_h = max(1,(box_h+ph)/2)
                    raw_spd = (d/avg_h) * fps
                    cur_ema = ema_spd[tid]
                    if cur_ema > 0.5 and raw_spd > cur_ema * SPIKE_MULT:
                        raw_spd = cur_ema
                    spd = raw_spd
                    dist_bl[tid] += d/avg_h

                ema_spd[tid] = EMA_A*spd + (1-EMA_A)*ema_spd[tid]
                s = ema_spd[tid]

                if r_state[tid] == IDLE:
                    if s > WALK_SPD: r_state[tid] = WALK
                elif r_state[tid] == WALK:
                    if s < WALK_SPD * 0.7: r_state[tid] = IDLE
                    elif s > MIN_SPD:
                        r_state[tid] = POS; r_cnt[tid] = 1; dist_bl[tid] = 0.0
                elif r_state[tid] == POS:
                    if s > MIN_SPD: r_cnt[tid] += 1
                    else: r_state[tid] = WALK; r_cnt[tid] = 0; dist_bl[tid] = 0.0
                    if r_cnt[tid] >= CONFIRM and dist_bl[tid] >= MIN_DIST:
                        r_state[tid] = RUN
                elif r_state[tid] == RUN:
                    if s < RUN_EXIT_SPD:
                        r_state[tid] = WALK; r_cnt[tid] = 0; dist_bl[tid] = 0.0

                # Stats event firing for running
                if r_state[tid] == RUN and not event_fired.get(f"{tid}_run"):
                    _add_event(camera_id, "System Alert",
                               "Individual running detected.", "warning", vid_time, cam_name)
                    event_fired[f"{tid}_run"] = True
                    with _stats_lock:
                        if camera_id in _camera_stats:
                            _camera_stats[camera_id]["alerts"].append(time.time())
                            _camera_stats[camera_id]["total_alerts_fired"] += 1

                # Loitering — wall-clock based, survives video loops
                history    = list(t_hist[tid])
                three_ago  = now_wall - 3.0
                early      = [(x,y,h) for x,y,h,t in history if t >= three_ago]

                if len(early) >= max(3, int(fps * 1.0)):
                    xs_e  = sorted([p[0] for p in early])
                    ys_e  = sorted([p[1] for p in early])
                    med_x = xs_e[len(xs_e)//2]
                    med_y = ys_e[len(ys_e)//2]
                    ah2   = max(1, np.mean([p[2] for p in early]))
                    spr   = max(
                        max(abs(p[0]-med_x) for p in early) / ah2,
                        max(abs(p[1]-med_y) for p in early) / ah2,
                    )
                    if spr < LOITER_RAD:
                        if tid not in loiter_wall_start:
                            loiter_wall_start[tid] = now_wall - 3.0
                        elapsed = now_wall - loiter_wall_start[tid]
                        if elapsed >= LOITER_TIME:
                            loitering[tid] = True
                            if not event_fired.get(f"{tid}_loiter"):
                                _add_event(camera_id, "System Alert",
                                           "Individual observed lingering near monitored area.",
                                           "warning", vid_time, cam_name)
                                event_fired[f"{tid}_loiter"] = True
                                with _stats_lock:
                                    if camera_id in _camera_stats:
                                        _camera_stats[camera_id]["alerts"].append(time.time())
                                        _camera_stats[camera_id]["total_alerts_fired"] += 1
                    else:
                        loiter_wall_start.pop(tid, None)
                        loitering[tid] = False
                else:
                    loiter_wall_start.pop(tid, None)
                    loitering[tid] = False

                if r_state[tid] == RUN:
                    color = (0,0,255); label = f"#{tid} RUNNING"
                elif loitering[tid]:
                    elapsed = now_wall - loiter_wall_start.get(tid, now_wall)
                    color = (0,100,255); label = f"#{tid} LOITERING {int(elapsed)}s"
                elif r_state[tid] in (POS, WALK):
                    color = (0,200,0); label = f"#{tid} WALKING"
                else:
                    color = (0,255,0); label = f"#{tid}"

                if r_state[tid] in (POS, RUN) or loitering.get(tid): movers += 1
                if r_state[tid] == RUN: runners += 1
                if loitering.get(tid): loiterers += 1

            cv2.rectangle(ann_frame, (x1,y1), (x2,y2), color, 1)
            cv2.putText(ann_frame, label, (x1, max(10, y1-6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
            cv2.circle(ann_frame, (cx,cy), 3, color, -1)

        # ── Update per-camera stats ────────────────────────────────────────────
        with _stats_lock:
            if camera_id in _camera_stats:
                cs = _camera_stats[camera_id]
                cs["people_count"]     = len(tracked)
                cs["active_movers"]    = movers
                cs["active_runners"]   = runners
                cs["active_loiterers"] = loiterers
                cs["cum_people"]       += len(tracked)
                cs["cum_movers"]       += movers
                cs["cum_runners"]      += runners
                cs["cum_loiterers"]    += loiterers
                cs["frames_processed"] += 1
                now = time.time()
                while cs["alerts"] and now - cs["alerts"][0] > 60:
                    cs["alerts"].popleft()

        _jpeg_pool.submit(_encode_and_store, ann_frame, camera_id, lk)

    print(f"[Annotator:{camera_id[:8]}] exited")


# ── Public API ─────────────────────────────────────────────────────────────────

def start(camera_id: str, scenario: str, cfg: dict) -> None:
    _ensure_infer_thread()

    with _registry_lock:
        _stop_locked(camera_id)

        alive = sum(1 for ev in _reader_stop.values() if not ev.is_set())
        if alive >= MAX_CAMERAS:
            raise ValueError(f"Maximum simultaneous cameras ({MAX_CAMERAS}) reached.")

        video = cfg.get("video", 0)
        try:
            cap = cv2.VideoCapture(video if isinstance(video, int) else str(video))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25
            cap.release()
        except Exception:
            fps = 25
        cfg = dict(cfg, fps=fps)

        sr = threading.Event(); sa = threading.Event()
        _result_queues[camera_id]  = queue.Queue(maxsize=2)
        _latest_frames[camera_id]  = None
        _latest_hashes[camera_id]  = b""
        _frame_locks[camera_id]    = threading.Lock()
        _reader_stop[camera_id]    = sr
        _annotator_stop[camera_id] = sa

    threading.Thread(target=_reader_thread_fn,
                     args=(camera_id, cfg, sr),
                     name=f"reader-{camera_id}", daemon=True).start()
    threading.Thread(target=_annotator_thread_fn,
                     args=(camera_id, scenario, cfg, sa),
                     name=f"annotator-{camera_id}", daemon=True).start()

    print(f"[camera_manager] started {camera_id[:16]} ({scenario})")


def _stop_locked(camera_id: str):
    for d in (_reader_stop, _annotator_stop, _result_queues,
              _latest_frames, _frame_locks, _latest_hashes):
        d.pop(camera_id, None)
    with _stats_lock:
        _camera_stats.pop(camera_id, None)
        # Remove events belonging to this camera
        remaining = [e for e in _global_stats["events"] if e.get("camera_id") != camera_id]
        _global_stats["events"].clear()
        for e in remaining:
            _global_stats["events"].append(e)


def clear_all_events() -> None:
    """Clear all events and stats — called on frontend page load."""
    with _stats_lock:
        _global_stats["events"].clear()


def stop(camera_id: str) -> bool:
    with _registry_lock:
        if camera_id not in _reader_stop:
            return False
        _reader_stop[camera_id].set()
        _annotator_stop[camera_id].set()
        _stop_locked(camera_id)
    print(f"[camera_manager] stopped {camera_id[:16]}")
    return True


def stop_all():
    with _registry_lock:
        ids = list(_reader_stop.keys())
    for cid in ids:
        stop(cid)


def get_frame(camera_id: str) -> bytes | None:
    lk = _frame_locks.get(camera_id)
    if lk is None: return None
    with lk:
        return _latest_frames.get(camera_id)


def get_frame_hash(camera_id: str) -> bytes:
    """Return MD5 of latest frame — used by stream endpoint for dedup."""
    lk = _frame_locks.get(camera_id)
    if lk is None: return b""
    with lk:
        return _latest_hashes.get(camera_id, b"")


def status() -> list[dict]:
    with _registry_lock:
        return [
            {
                "camera_id": cid,
                "alive":     not ev.is_set(),
                "has_frame": bool(_latest_frames.get(cid)),
            }
            for cid, ev in _reader_stop.items()
        ]