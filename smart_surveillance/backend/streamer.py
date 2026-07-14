import sys
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(PROJECT_ROOT)


import cv2
import json
import os
from fastapi import Request
from scenarios.behavior import run as behavior_run
from scenarios.line_crossing import run as metro_run
from scenarios.zone_detection import run as zone_run


# simple in-memory registry of stop signals keyed by token.  the
# frontend can POST to ``/stop`` to set a flag here; the generator will
# notice and break out the next time it produces a frame.
stop_signals: dict[str, bool] = {}

async def await_request_disconnected(request: Request) -> bool:
    """Return True if the client has disconnected from the request."""
    try:
        return await request.is_disconnected()
    except Exception:
        return True


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

async def frame_generator(
    request: Request,
    scenario: str,
    line: str | None = None,
    restricted_point: str | None = None,
    zone: str | None = None,
    video: str | None = None,
    token: str | None = None,
):
    """Asynchronous generator that yields MJPEG frames until client disconnects."""

    config_map = {
        "metro_line":     "config/metro_line.json",
        "behavior":       "config/behavior.json",
        "zone_detection": "config/restricted_zone.json",
    }

    if scenario not in config_map:
        raise ValueError("Invalid scenario")

    config_path = os.path.join(PROJECT_ROOT, config_map[scenario])

    with open(config_path) as f:
        cfg = json.load(f)

    # override config values from query params
    if video is not None:
        try:
            cfg["video"] = int(video)
        except ValueError:
            cfg["video"] = video

    if line is not None:
        parts = line.split(",")
        if len(parts) == 4:
            coords = list(map(int, parts))
            cfg["line"] = [[coords[0], coords[1]], [coords[2], coords[3]]]

    if restricted_point is not None:
        parts = restricted_point.split(",")
        if len(parts) == 2:
            coords = list(map(int, parts))
            cfg["restricted_point"] = [coords[0], coords[1]]

    if zone is not None:
        # zone is semicolon-separated "x,y" pairs  e.g. "100,200;300,200;300,400;100,400"
        points = []
        for pair in zone.split(";"):
            x, y = map(int, pair.split(","))
            points.append([x, y])
        cfg["zone"] = points

    video_src = cfg["video"]
    # make relative filesystem paths absolute
    if isinstance(video_src, str):
        if not (video_src.startswith("http://") or video_src.startswith("https://") or video_src.startswith("rtmp://")):
            if not os.path.isabs(video_src):
                video_src = os.path.join(PROJECT_ROOT, video_src)
            video_src = os.path.normpath(video_src)
    cfg["video"] = video_src

    # choose pipeline
    try:
        if scenario == "behavior":
            gen = behavior_run(video_src, cfg, stream=True)
        elif scenario == "zone_detection":
            gen = zone_run(video_src, cfg, stream=True)
        else:
            gen = metro_run(video_src, cfg, stream=True)
    except Exception as e:
        print(f"[ERROR] scenario '{scenario}' initialization failed: {e}")
        import numpy as np
        err_frame = np.zeros((240, 640, 3), dtype="uint8")
        cv2.putText(err_frame, str(e), (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        while True:
            _, buffer = cv2.imencode('.jpg', err_frame)
            frame_bytes = buffer.tobytes()
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
        return

    if gen is None:
        err = "pipeline returned no frames (video open failure perhaps)"
        print(f"[ERROR] {err}")
        import numpy as np
        err_frame = np.zeros((240, 640, 3), dtype="uint8")
        cv2.putText(err_frame, err, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        while True:
            _, buffer = cv2.imencode('.jpg', err_frame)
            frame_bytes = buffer.tobytes()
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
        return

    for frame in gen:
        if await await_request_disconnected(request):
            print("[INFO] client disconnected, stopping generator")
            break
        if token and stop_signals.get(token):
            print(f"[INFO] stop signal received for token {token}")
            break

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
        )