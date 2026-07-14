# Smart Surveillance System (YOLOv8 + FastAPI + React)
AI-powered real-time surveillance system capable of monitoring live cameras and detecting suspicious activities.

Supports **Windows, Linux and MacOS**  
Automatically uses **CPU or NVIDIA GPU (CUDA)**.

---

# Features

- Person detection using **YOLOv8**
- Running / abnormal behavior detection
- Metro line crossing detection
- Restricted zone monitoring
- Live webcam streaming inside browser
- Full web dashboard (React UI)
- User authentication (Admin / Viewer)
- Automatic GPU usage if CUDA available
- Automatic model download (no manual setup)
- One-command Docker setup (no manual installs)

---

# Quick Start (Docker)

> No Python, Node.js, or PostgreSQL installation needed.  
> Docker handles everything automatically.

## Requirements

| Software       | Version |
|----------------|---------|
| Docker         | Latest  |
| Docker Compose | Latest  |
| Git            | Latest  |

### Install Docker

**Linux (Arch / CachyOS)**
```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

**Windows / Mac**  
Download Docker Desktop: https://www.docker.com/products/docker-desktop

---

## Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

---

## CPU Only (no NVIDIA GPU)

Works on any machine — Windows, Linux, Mac, integrated graphics, anything.

```bash
docker compose up --build
```

---

## NVIDIA GPU

Requires nvidia-container-toolkit on Linux, or Docker Desktop on Windows.

### Linux setup (one-time)
```bash
sudo pacman -S nvidia-container-toolkit        # Arch / CachyOS
# Ubuntu: sudo apt install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Windows setup (one-time)
Install Docker Desktop with WSL2 backend. NVIDIA support is built in — nothing extra needed.

### Run with GPU
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

---

Open browser: **http://localhost:5173**

First run takes 5-10 minutes (downloads PyTorch base image).  
Subsequent runs start in seconds.

---

## Useful Commands

```bash
# Run in background
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Rebuild after code changes
docker compose up --build
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build

# Connect to database
docker exec -it smss_db psql -U surveillance_user -d surveillance
```

---

## USB / Webcam Passthrough (Linux)

Find your camera:
```bash
ls /dev/video*
```

Uncomment the `devices` block in `docker-compose.yml`:
```yaml
devices:
  - /dev/video0:/dev/video0
```

Then rebuild:
```bash
docker compose up --build backend
```

---

## Database

PostgreSQL runs inside Docker. Data persists across restarts automatically.

**Connect interactively:**
```bash
docker exec -it smss_db psql -U surveillance_user -d surveillance
```

Once inside, useful commands:
```sql
\dt                  -- list all tables
\d users             -- show users table structure
SELECT * FROM users; -- see all registered users
\q                   -- exit
```

**One-liner queries (without entering interactive mode):**
```bash
# Check tables exist
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "\dt"

# See all users
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "SELECT * FROM users;"

# Show users table structure
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "\d users"
```

**Wipe and start fresh:**
```bash
docker compose down -v
docker compose up
```

---

---

# Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

## Requirements

| Software   | Version |
|------------|---------|
| Python     | 3.10+   |
| Node.js    | 18+     |
| PostgreSQL | 14+     |
| Git        | Latest  |

## 1. Clone Repository

```bash
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
```

## 2. Create Python Virtual Environment

**Windows**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux / Mac**
```bash
python -m venv venv
source venv/bin/activate
```

## 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

## 4. Database Setup (PostgreSQL)

Install PostgreSQL: https://www.postgresql.org/download/

```bash
psql -U postgres
```

```sql
CREATE DATABASE surveillance;
CREATE USER surveillance_user WITH PASSWORD 'surveillance_pass';
GRANT ALL PRIVILEGES ON DATABASE surveillance TO surveillance_user;
\c surveillance
GRANT ALL ON SCHEMA public TO surveillance_user;
ALTER SCHEMA public OWNER TO surveillance_user;
\q
```

Create `backend/.env`:
```
DATABASE_URL=postgresql://surveillance_user:surveillance_pass@localhost:5432/surveillance
```

Initialize tables:
```bash
cd backend
python -m db.init_db
```

## 5. Install Frontend Dependencies

```bash
cd frontend
npm install
```

## 6. Run the System

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn app:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open browser: **http://localhost:5173**

</details>

---

# Authentication

Users can register directly from the UI.

Roles:
- `admin` — full access
- `viewer` — stream viewing only

Credentials stored using **bcrypt hashing** in PostgreSQL.

---

# Running Detection Without Web UI

```bash
python main.py config/metro_line.json      # Line crossing
python main.py config/restricted_zone.json # Restricted zone
python main.py config/behavior.json        # Behavior detection
```

Press **Q** to exit.

---

# Using Your Own Video

Place videos inside `videos/` and edit the config:
```json
"video": "videos/myvideo.mp4"
```

# Using Webcam

```json
{
  "scenario": "BEHAVIOR",
  "video": 0
}
```

---

# Project Structure

```
smart_surveillance/
├── backend/           FastAPI backend + API routes
├── core/              Detection engines
├── scenarios/         Scenario logic
├── config/            Scenario configuration files
├── frontend/          React dashboard
├── videos/            Sample videos
├── main.py            CLI detection runner
├── requirements.txt
├── docker-compose.yml
└── docker-compose.gpu.yml
```

---

# Tested Platforms

| OS                  | Status |
|---------------------|--------|
| Windows 10/11       | OK     |
| Ubuntu / Arch Linux | OK     |
| MacOS               | OK     |
| NVIDIA GPU          | OK     |
| CPU Only            | OK     |

---

# Troubleshooting

**GPU not detected in Docker (Linux)**
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

**Port already in use**  
Change the left side of the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "5174:80"
```

**Database connection error on first start**
```bash
docker compose restart backend
```

**Webcam not opening**  
Close other apps using the camera (Zoom, Teams, browser tabs).

---

# License

Educational Mini Project

---

# Author

Abhiram S
