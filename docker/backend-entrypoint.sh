#!/bin/sh
set -eu

echo "[entrypoint] Checking NutriSync SQLite database..."

if [ ! -f "$NUTRISYNC_DB_PATH" ]; then
    echo "[entrypoint] Database not found at $NUTRISYNC_DB_PATH. Running db_setup.py to initialize..."
    python db_setup.py
    echo "[entrypoint] Database initialization completed successfully."
else
    echo "[entrypoint] Existing database detected at $NUTRISYNC_DB_PATH. Preserving existing data."
fi

echo "[entrypoint] Launching NutriSync backend (uvicorn, workers=1)..."
exec python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 1
