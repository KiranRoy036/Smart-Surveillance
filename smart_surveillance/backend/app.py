from __future__ import annotations

import asyncio
import json
import os
import time

from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI, UploadFile, File, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from psycopg2.extensions import connection

from streamer import frame_generator, stop_signals
import camera_manager
from db import init_db_pool, close_db_pool, get_db_connection
from db.schema import create_tables
from db.auth import authenticate_user, register_user

# optional legacy router (may not exist on rollback)
try:
    from routes_auth import router as auth_router  # type: ignore
except ImportError:
    auth_router = None

app = FastAPI()


# ── Pydantic models ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=4, max_length=128)
    role: str = Field(min_length=3, max_length=20)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class StartCameraRequest(BaseModel):
    """
    Body for POST /cameras/start.

    scenario     : "behavior" | "metro_line" | "zone_detection"
    video        : file path, RTMP URL, or int (0 for webcam)
    line         : "x1,y1,x2,y2"   (metro_line only)
    restricted_point: "x,y"        (metro_line only)
    zone         : "x1,y1;x2,y2;…" (zone_detection only)
    """
    camera_id: str
    scenario: str
    video: str | int | None = None
    line: str | None = None
    restricted_point: str | None = None
    zone: str | None = None
    infer_every: int = 2  # 1=every frame, 2=every 2nd, 3=every 3rd


# ── Startup / shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup() -> None:
    init_db_pool()
    db_dep = get_db_connection()
    conn = next(db_dep)
    try:
        create_tables(conn)
    except Exception as exc:
        print(f"startup: {exc}")
    finally:
        db_dep.close()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_db_pool()
    camera_manager.stop_all()


# ── Middleware / static ───────────────────────────────────────────────────────

if auth_router is not None:
    app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VIDEOS_DIR = os.path.join(PROJECT_ROOT, "videos")
CONFIG_DIR = os.path.join(PROJECT_ROOT, "config")
os.makedirs(VIDEOS_DIR, exist_ok=True)

app.mount("/videos", StaticFiles(directory=VIDEOS_DIR), name="videos")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Smart Surveillance Backend Running"}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/register")
def api_register(
    payload: RegisterRequest,
    conn: connection = Depends(get_db_connection),
):
    role = payload.role.strip().lower()
    if role not in {"admin", "viewer"}:
        raise HTTPException(status_code=400, detail="Role must be admin or viewer")
    try:
        user = register_user(conn, payload.username, payload.password, role)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"message": "User registered successfully", "user": user}


@app.post("/api/login")
def api_login(
    payload: LoginRequest,
    conn: connection = Depends(get_db_connection),
):
    user = authenticate_user(conn, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"message": "Login successful", "user": user}


# ── File upload ───────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    dest_path = os.path.join(VIDEOS_DIR, file.filename)
    with open(dest_path, "wb") as f:
        content = await file.read()
        f.write(content)
    return {"location": f"videos/{file.filename}"}


# ── Legacy single-stream endpoints (unchanged) ────────────────────────────────

@app.post("/stop")
async def stop_stream(token: str):
    stop_signals[token] = True
    return {"stopped": True}


@app.get("/stream/{scenario}")
def stream_video(
    request: Request,
    scenario: str,
    line: str | None = None,
    restricted_point: str | None = None,
    zone: str | None = None,
    video: str | None = None,
    token: str | None = None,
):
    return StreamingResponse(
        frame_generator(request, scenario, line, restricted_point, zone, video, token),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ── Multi-camera endpoints ────────────────────────────────────────────────────

def _build_cfg(scenario: str, payload: StartCameraRequest) -> dict:
    """
    Load base config JSON for the scenario and overlay values from the request.
    """
    config_map = {
        "metro_line":     "metro_line.json",
        "behavior":       "behavior.json",
        "zone_detection": "restricted_zone.json",
    }
    cfg_file = config_map.get(scenario)
    if cfg_file is None:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {scenario}")

    cfg_path = os.path.join(CONFIG_DIR, cfg_file)
    with open(cfg_path) as f:
        cfg = json.load(f)

    # Override video source
    if payload.video is not None:
        # make relative paths absolute
        video = payload.video
        if isinstance(video, str) and not os.path.isabs(video) and not video.startswith(("rtmp://", "rtsp://", "http")):
            video = os.path.join(PROJECT_ROOT, video)
        cfg["video"] = video

    # Override line params (metro_line)
    if payload.line:
        parts = [int(v) for v in payload.line.split(",")]
        cfg["line"] = [[parts[0], parts[1]], [parts[2], parts[3]]]

    if payload.restricted_point:
        x, y = [int(v) for v in payload.restricted_point.split(",")]
        cfg["restricted_point"] = [x, y]

    # Override zone params (zone_detection)
    if payload.zone:
        cfg["zone"] = [
            [int(v) for v in pair.split(",")]
            for pair in payload.zone.split(";")
            if pair.strip()
        ]

    # Inference throttle
    cfg["infer_every"] = max(1, min(5, payload.infer_every))

    # Pass camera_id as name if no camera_name in config
    if "camera_name" not in cfg:
        cfg["camera_name"] = payload.camera_id[:16]

    return cfg


@app.post("/cameras/start")
def start_camera(payload: StartCameraRequest):
    """
    Start inference on a camera in the background.
    The frontend supplies a camera_id (UUID) it generated itself.
    Returns immediately — the worker starts asynchronously.
    """
    try:
        cfg = _build_cfg(payload.scenario, payload)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        camera_manager.start(payload.camera_id, payload.scenario, cfg)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    return {"started": True, "camera_id": payload.camera_id}


@app.post("/cameras/stop")
def stop_camera(camera_id: str):
    """Stop inference for one camera."""
    found = camera_manager.stop(camera_id)
    return {"stopped": found, "camera_id": camera_id}


@app.get("/cameras/status")
def cameras_status():
    """List all active camera workers and their state."""
    return {"cameras": camera_manager.status()}


@app.get("/cameras/stream/{camera_id}")
async def stream_camera(camera_id: str, request: Request):
    """
    MJPEG stream with frame dedup — only sends new frames to the browser.
    Prevents hammering the lock and sending duplicate data.
    """
    async def generate():
        placeholder: bytes | None = None
        last_hash: bytes = b""

        while True:
            if await request.is_disconnected():
                break

            current_hash = camera_manager.get_frame_hash(camera_id)

            if current_hash and current_hash != last_hash:
                frame = camera_manager.get_frame(camera_id)
                if frame:
                    last_hash = current_hash
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
                    )
                    await asyncio.sleep(0.04)   # ~25 fps max
                    continue

            if placeholder is None:
                placeholder = _make_placeholder_frame(camera_id)

            if not last_hash:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + placeholder + b"\r\n"
                )

            await asyncio.sleep(0.1)   # poll at 10Hz when idle

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_placeholder_frame(camera_id: str) -> bytes:
    """Return a small dark JPEG with 'Connecting...' text."""
    import numpy as np
    import cv2
    img = np.zeros((240, 426, 3), dtype=np.uint8)
    cv2.putText(img, "Connecting...", (80, 115),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 100, 100), 2)
    cv2.putText(img, camera_id[:16], (80, 145),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (60, 60, 60), 1)
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return buf.tobytes()

@app.get("/api/stats")
def api_stats():
    """Returns the latest aggregated stats and events across all active cameras."""
    return camera_manager.get_stats()


@app.post("/api/clear-events")
def api_clear_events():
    """Clear all in-memory events — called when the admin page loads."""
    camera_manager.clear_all_events()
    return {"cleared": True}