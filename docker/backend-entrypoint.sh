#!/bin/sh
set -eu

PORT="${PORT:-8000}"

if [ -n "${TURSO_DATABASE_URL:-}" ]; then
    # Production: data lives in Turso (cloud SQLite) and survives restarts/redeploys.
    # Creates missing tables and loads the food table only when it is empty.
    echo "[entrypoint] Using Turso database. Making sure tables exist..."
    python backend/db_setup.py --if-needed
elif [ ! -f "$NUTRISYNC_DB_PATH" ]; then
    echo "[entrypoint] Database not found at $NUTRISYNC_DB_PATH. Running db_setup.py to initialize..."
    python backend/db_setup.py
    echo "[entrypoint] Database initialization completed successfully."
else
    echo "[entrypoint] Existing database detected at $NUTRISYNC_DB_PATH. Preserving existing data."
fi

echo "[entrypoint] Launching NutriSync backend on port ${PORT} (uvicorn, workers=1)..."
exec python -m uvicorn backend.app:app --host 0.0.0.0 --port "${PORT}" --workers 1
