# syntax=docker/dockerfile:1.4
# -----------------------------------------------------------------------------
# Stage 1: Build & wheels
# -----------------------------------------------------------------------------
FROM python:3.14.7-slim-bookworm AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY backend/requirements.txt requirements.txt

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --prefix=/install -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 2: Runtime
# -----------------------------------------------------------------------------
FROM python:3.14.7-slim-bookworm AS runner

ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=0.3.0

LABEL org.opencontainers.image.title="NutriSync Backend" \
      org.opencontainers.image.description="FastAPI backend adapter for NutriSync Indian nutrition coach" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.authors="NutriSync Team" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/lohith400/Nutrition_traker"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    NUTRISYNC_DB_PATH=/data/nutrisync.db \
    PATH="/install/bin:${PATH}" \
    PYTHONPATH="/install/lib/python3.12/site-packages:/app"

WORKDIR /app

# Create non-root user and prepare directories
RUN groupadd -g 10001 nutrisync \
    && useradd -u 10001 -g nutrisync -s /bin/sh -m -d /home/nutrisync nutrisync \
    && mkdir -p /data /app/backend /app/data \
    && chown -R nutrisync:nutrisync /data /app /home/nutrisync

# Copy installed dependencies from builder
COPY --from=builder /install /install

# Copy required application modules only (never copy .env, tests, frontend, .git)
COPY --chown=nutrisync:nutrisync backend/ /app/backend/
COPY --chown=nutrisync:nutrisync db_setup.py math_engine.py memory_agent.py menu_planner.py orchestrator.py rag_resolver.py /app/
COPY --chown=nutrisync:nutrisync data/anuvaad.xlsx /app/data/
COPY --chown=nutrisync:nutrisync docker/backend-entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

USER nutrisync:nutrisync

VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').getcode() == 200 else 1)"

ENTRYPOINT ["/app/entrypoint.sh"]
