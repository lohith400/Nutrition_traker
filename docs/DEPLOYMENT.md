# NutriSync Deployment & Operations Guide

This guide covers running NutriSync with Docker locally, setting up continuous deployment with GitHub Actions, managing the SQLite persistent volume, and scaling considerations.

---

## 1. Running Locally with Docker

### Prerequisites
- [Docker Engine](https://docs.docker.com/engine/install/) (v24+) & [Docker Compose](https://docs.docker.com/compose/) (v2+)

### Quick Start
1. **Clone and enter repository**:
   ```bash
   git clone https://github.com/lohith400/Nutrition_traker.git
   cd Nutrition_traker
   ```

2. **Configure environment (optional for AI Coach)**:
   ```bash
   cp backend/.env.example backend/.env
   # Add your ONE of OPENROUTER_API_KEY / GEMINI_API_KEY / DEEPSEEK_API_KEY in backend/.env if you want AI coach features
   ```

3. **Start the containers**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify running containers**:
   - Backend API: [http://localhost:8000/health](http://localhost:8000/health) (returns `{"status":"ok","service":"NutriSync API"}`)
   - Frontend Dashboard: [http://localhost:3000](http://localhost:3000)

5. **Stop containers**:
   ```bash
   docker compose down
   ```
   *(Add `-v` if you wish to wipe the local persistent SQLite database volume).*

---

## 2. GitHub CI/CD Configuration

### Required Repository Settings

1. **Actions Permissions**:
   - Navigate to **Settings** > **Actions** > **General** > **Workflow permissions**.
   - Select **Read and write permissions** (required for publishing container images to GitHub Container Registry `ghcr.io`).

2. **GitHub Container Registry (GHCR) Package Visibility**:
   - Once images are pushed (`ghcr.io/<owner>/nutrisync-backend` and `ghcr.io/<owner>/nutrisync-frontend`), navigate to your GitHub Profile / Organization **Packages**.
   - Set package visibility to **Public** if deploying to external hosts without registry credentials, or configure read tokens on private hosts.

3. **Repository Variables**:
   Navigate to **Settings** > **Secrets and variables** > **Actions** > **Variables** tab:
   - `PRODUCTION_API_URL`: The public-facing HTTPS URL of the backend (e.g., `https://api.yourdomain.com`). This is inlined into the frontend build.
   - `DEPLOY_ENABLED`: Set to `true` when ready to enable automatic deployment to your server.

4. **Repository Secrets (for VPS deployment)**:
   Navigate to **Settings** > **Secrets and variables** > **Actions** > **Secrets** tab:
   - `SSH_HOST`: IP or domain of your production VPS.
   - `SSH_USER`: SSH username (e.g. `ubuntu` or `deploy`).
   - `SSH_KEY`: Private SSH key authorized on the target host.

5. **Production Environment & Protection Rules**:
   - Navigate to **Settings** > **Environments** > **New environment** named `production`.
   - Configure **Required reviewers** to require manual sign-off before deployments take place.

### How to Cut a Release
Deployments are triggered when a release tag is pushed:
```bash
git tag v0.3.0
git push origin v0.3.0
```
This triggers `.github/workflows/cd.yml`, building multi-arch images (`linux/amd64`, `linux/arm64`), pushing to GHCR, and triggering deployment if enabled.

---

## 3. SQLite Database Management & Backups

The SQLite database file is persisted inside a Docker named volume (`nutrisync_data`) at `/data/nutrisync.db`.

### Hot Backup using SQLite Online Backup API
Because SQLite supports safe concurrent online backups, you can create a consistent backup without stopping the container:

```bash
docker run --rm \
  -v nutrisync_data:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine sh -c "apk add --no-cache sqlite && sqlite3 /data/nutrisync.db '.backup /backup/nutrisync_backup_\$(date +%Y%m%d_%H%M%S).db'"
```

### Restoring from a Backup
To restore a backup into the named volume:
```bash
# 1. Stop backend container to release write locks
docker compose stop backend

# 2. Restore database file
docker run --rm \
  -v nutrisync_data:/data \
  -v $(pwd)/backups:/backup \
  alpine cp /backup/your_backup_file.db /data/nutrisync.db

# 3. Restart backend
docker compose start backend
```

---

## 4. Single-Writer SQLite Architecture & Scaling Note

- **Single Writer Constraint**: SQLite is an embedded database that allows multiple concurrent readers but only **one** writer at any given instant.
- **Worker Configuration**: The backend Docker image runs `uvicorn` with `--workers 1`, and the Docker Compose / production orchestrator must run **exactly 1 backend replica**.
- **Path to Horizontal Scale**: To scale out backend instances horizontally across multiple servers or pods:
  1. Migrate the data layer from SQLite to PostgreSQL.
  2. Update database connection handlers in `math_engine.py`, `memory_agent.py`, `menu_planner.py`, and `rag_resolver.py` to use `psycopg2` or `asyncpg` with connection pooling.
  3. Increase uvicorn workers and backend container replicas.
