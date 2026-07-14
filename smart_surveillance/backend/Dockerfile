# ── Stage: runtime ────────────────────────────────────────────────────────────
# pytorch/pytorch base already has CUDA, cuDNN, and Python 3.11 baked in.
# On a CPU-only machine Docker will still build and run fine — PyTorch
# auto-detects CUDA at runtime, so nothing needs to change in the image.
FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# System deps needed by OpenCV (libGL etc.) and psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project (backend code + scenarios + core + config)
# .dockerignore keeps venv, __pycache__, videos out of the image
COPY . .

# Videos directory — will be bind-mounted from host at runtime
RUN mkdir -p /app/videos

EXPOSE 8000

# Run from the backend subdirectory so relative imports work correctly
WORKDIR /app/backend

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
