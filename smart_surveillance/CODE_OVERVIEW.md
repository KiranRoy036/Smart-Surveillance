# Smart Surveillance System - Codebase Overview

This document provides a comprehensive overview of the **Smart Surveillance System** codebase, detailing the architecture, directory structure, individual module responsibilities, and how data flows through the application.

---

## 1. High-Level Architecture

The project is designed to be a real-time video analytics platform utilizing state-of-the-art object detection (YOLOv8). It can operate in two modes:
1. **Headless / CLI Mode**: Using `main.py` to run scenarios locally on the host machine using OpenCV windows.
2. **Web Dashboard Mode**: A full-stack setup where a FastAPI backend processes the video feeds and streams them to a React-based web frontend via MJPEG streaming, while also handling user authentication backed by PostgreSQL.

### Technology Stack
*   **Computer Vision & AI**: `ultralytics` (YOLOv8), `OpenCV`, `PyTorch`
*   **Backend Server**: `FastAPI`, `Uvicorn`, `PostgreSQL` (with `psycopg2`)
*   **Frontend Web**: `React 19`, `Vite`, `TypeScript`, `Framer Motion`, `React Router`

---

## 2. Directory Structure

```text
smart_surveillance/
├── main.py                — Main CLI entry point for local execution.
├── README.md              — Project documentation and setup guide.
├── requirements.txt       — Python backend/core dependencies.
├── backend/               — FastAPI server and API logic.
│   ├── app.py             — FastAPI application definition and REST endpoints.
│   ├── streamer.py        — Async MJPEG streaming integration logic.
│   └── db/                — Database connection pools, schema, and auth logic.
├── core/                  — Shared tracking and utility processing logic.
│   ├── detector.py        — The core YOLO inference loop and behavior/speed Math.
│   └── streamer.py        — Synchronous stream wrapper for local running.
├── scenarios/             — Specific use-case implementations.
│   ├── behavior.py        — Scenario wrapper for running/loitering detection.
│   └── line_crossing.py   — Implementation of spatial line-crossing violations.
├── config/                — JSON files defining scenarios (video source, lines, etc.).
│   ├── behavior.json
│   ├── metro_line.json
│   └── restricted_zone.json
├── frontend/              — The React + TypeScript web application.
│   ├── src/               — Source code (App.tsx, components, pages, api).
│   ├── package.json       — Node dependencies.
│   └── vite.config.ts     — Vite builder configuration.
└── videos/                — Directory for storing uploaded or sample video files.
```

---

## 3. Module Breakdown

### 3.1. `main.py` (CLI Entrypoint)
Acts as the local execution runner. It:
1. Validates the given JSON configuration file path.
2. Reads the scenario type (`LINE_CROSSING` or `BEHAVIOR`) and video source.
3. Dynamically imports the corresponding scenario runner from the `scenarios/` directory.
4. Executes the local video window loop.

### 3.2. `core/` (Detection Engines)
*   **`detector.py`**: The heavy lifting for behavior analysis. It tracks individuals using YOLOv8, calculates their speed (normalized to body-lengths per second to be zoom/resolution invariant), and maintains individual state-machines to classify behavior as `IDLE`, `POSSIBLE` (running), or `RUNNING`. It also calculates spatial loitering bounds.
*   **`streamer.py`**: Contains a synchronous thread-based `CameraStream` class that can capture frames and encode them into JPEG bytes.

### 3.3. `scenarios/` (Use-Case Implementations)
*   **`behavior.py`**: A thin wrapper that invokes `run_behavior` from `core.detector`.
*   **`line_crossing.py`**: Contains the mathematical logic to determine if a tracked person (specifically by their foot-point) crosses a defined line into a restricted zone (`side_of_line` calculation). It uses YOLOv8 for detection and maintains a consecutive-frame crossing confirmation buffer to reduce false positives. Both scripts support yielding frames (for HTTP streams) or rendering to an `cv2.imshow` window.

### 3.4. `backend/` (FastAPI Server)
*   **`app.py`**: Sets up the FastAPI application, configures CORS, serves static uploaded videos, handles Database connection events, and provides API routes for `/api/register`, `/api/login`, `/upload`, and `/stream/{scenario}`.
*   **`streamer.py`**: Implements `frame_generator`, an asynchronous wrapper around the scenario generators. It overrides config files with parameters passed in the HTTP request (e.g., overriding the video file, line coordinates, or zone points) and streams JPEG frames as `multipart/x-mixed-replace`. It proactively handles client disconnections and explicit stop tokens.
*   **`db/`**: Handles PostgreSQL `psycopg2` connection pooling, table initialization/schema (`users` table), and bcrypt-based password hashing/authentication.

### 3.5. `frontend/` (React SPA)
The frontend is a single-page application built with React 19 and Vite.
*   **`App.tsx`**: Defines the main routes including a Landing Page (`/`), Admin Dashboard (`/admin`), and Viewer Dashboard (`/viewer`).
*   **State & UI**: Uses standard React components and hooks to interact with the backend APIs (`/api/login`, `/upload`) and renders the `<img src=".../stream/..." />` endpoints to display live video analytics without needing specialized video player plugins.
*   Styling and animations are assisted by standard CSS and `framer-motion`.

---

## 4. Data Flow

1. **Configuration**: A scenario is initiated either via the CLI with a `config.json` file, or via the Web Dashboard passing parameters in the URL query to the backend.
2. **Video Capture**: OpenCV connects to the defined `source` (a local file, a camera index like `0`, or an HTTP/RTMP stream).
3. **Inference Loop**: For every frame, the target wall-time is calculated to sync the frame rate (FPS locking). YOLOv8 detects and tracks classes (Class 0: Person).
4. **Analytics**: Depending on the scenario, `core` or `scenarios` logic calculates speeds or positions. Bounding boxes, labels, and status colors are drawn onto the current OpenCV frame.
5. **Output**:
    *   *Local*: Frame is displayed using `cv2.imshow`.
    *   *Web*: Frame is encoded to JPEG (`cv2.imencode`) and yielded by FastAPI as a streaming response back to the client browser's `<img>` tag.
