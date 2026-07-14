# Smart-Surveillance
BTech Mini Project- AI Smart Surveilance System


Features
Person detection using YOLOv8
Running / abnormal behavior detection
Metro line crossing detection
Restricted zone monitoring
Live webcam streaming inside browser
Full web dashboard (React UI)
User authentication (Admin / Viewer)
Automatic GPU usage if CUDA available
Automatic model download (no manual setup)
One-command Docker setup (no manual installs)
Quick Start (Docker)
No Python, Node.js, or PostgreSQL installation needed.
Docker handles everything automatically.

Requirements
Software	Version
Docker	Latest
Docker Compose	Latest
Git	Latest
Install Docker
Linux (Arch / CachyOS)

sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
Windows / Mac
Download Docker Desktop: https://www.docker.com/products/docker-desktop

Clone Repository
git clone https://github.com/Abhiram086/smart_surveillance.git
cd smart_surveillance
CPU Only (no NVIDIA GPU)
Works on any machine — Windows, Linux, Mac, integrated graphics, anything.

docker compose up --build
NVIDIA GPU
Requires nvidia-container-toolkit on Linux, or Docker Desktop on Windows.

Linux setup (one-time)
sudo pacman -S nvidia-container-toolkit        # Arch / CachyOS
# Ubuntu: sudo apt install nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
Windows setup (one-time)
Install Docker Desktop with WSL2 backend. NVIDIA support is built in — nothing extra needed.

Run with GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
Open browser: http://localhost:5173

First run takes 5-10 minutes (downloads PyTorch base image).
Subsequent runs start in seconds.

Useful Commands
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
USB / Webcam Passthrough (Linux)
Find your camera:

ls /dev/video*
Uncomment the devices block in docker-compose.yml:

devices:
  - /dev/video0:/dev/video0
Then rebuild:

docker compose up --build backend
Database
PostgreSQL runs inside Docker. Data persists across restarts automatically.

Connect interactively:

docker exec -it smss_db psql -U surveillance_user -d surveillance
Once inside, useful commands:

\dt                  -- list all tables
\d users             -- show users table structure
SELECT * FROM users; -- see all registered users
\q                   -- exit
One-liner queries (without entering interactive mode):

# Check tables exist
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "\dt"

# See all users
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "SELECT * FROM users;"

# Show users table structure
docker exec -it smss_db psql -U surveillance_user -d surveillance -c "\d users"
Wipe and start fresh:

docker compose down -v
docker compose up
Manual Setup (Without Docker)
Click to expand manual setup instructions
Authentication
Users can register directly from the UI.

Roles:

admin — full access
viewer — stream viewing only
Credentials stored using bcrypt hashing in PostgreSQL.

Running Detection Without Web UI
python main.py config/metro_line.json      # Line crossing
python main.py config/restricted_zone.json # Restricted zone
python main.py config/behavior.json        # Behavior detection
Press Q to exit.

Using Your Own Video
Place videos inside videos/ and edit the config:

"video": "videos/myvideo.mp4"
Using Webcam
{
  "scenario": "BEHAVIOR",
  "video": 0
}
Project Structure
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
Tested Platforms
OS	Status
Windows 10/11	OK
Ubuntu / Arch Linux	OK
MacOS	OK
NVIDIA GPU	OK
CPU Only	OK
Troubleshooting
GPU not detected in Docker (Linux)

sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
Port already in use
Change the left side of the port mapping in docker-compose.yml:

ports:
  - "5174:80"
Database connection error on first start

docker compose restart backend
Webcam not opening
Close other apps using the camera (Zoom, Teams, browser tabs).

License
Educational Mini Project
