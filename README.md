# NutriSync

NutriSync is a nutrition coach for Indian food. It combines deterministic nutrition calculations with food matching, SQLite-backed meal history, meal suggestions, and an optional AI coach.


## What's new in this version

- **Coach shows related foods before logging.** When a name isn't an exact match, the coach no longer says "not found" or guesses. It shows every related food from the dataset as tappable cards with calories, protein, carbs and fat (per serving and per 100 g). You pick the one you had, set the amount and meal, and only then is it logged. The same search powers the Food log and Overview.
- **Custom foods page** (`/custom-foods`). List ingredients with quantities (g, tbsp, cup, katori, pieces...). Each is matched to dataset rows, a built-in table of everyday staples (`backend/ingredient_reference.py`: oil, ghee, raw rice, dal, vegetables, fruit...), or an AI estimate that is clearly labelled. Python adds everything up; the model never does arithmetic. Save the dish and log it from anywhere, including by name in the coach. You can also just tell the coach "I made upma with 60 g rava, 1 tbsp oil and an onion".
- **Food log:** search and log (including for an earlier day), edit quantity or meal, delete entries, per-day macro split, 7-day chart.
- **Overview:** calorie ring, macro bars, smart food search, remove entries.
- **Progress:** weight tracking with trend chart, pace and estimated goal date; 5-week consistency heatmap and streak.
- **Grocery:** nutrition of what's at home (raw values), quick-add staples. **Meal plans:** plan-fit meter and per-slot calorie ranges.

New API endpoints: `GET /api/food-options`, `POST /api/log-food-code`, `PATCH|DELETE /api/log/{id}`, `GET|POST|DELETE /api/weight`, `/api/custom-foods` (list, analyze, create, update, delete), `GET /api/grocery/nutrition`. New tables (`custom_foods`, `weight_logs`) are created automatically on existing databases. Tests: `python -m pytest tests`.

## Project structure

```text
.
├── backend/              FastAPI API & Core Nutrition Engine
│   ├── app.py            FastAPI API server
│   ├── math_engine.py    Deterministic BMR, macro, and calorie logic
│   ├── memory_agent.py   Profile, meal, and pattern persistence
│   ├── rag_resolver.py   Food-name matching & normalization
│   ├── menu_planner.py   Meal recommendation engine
│   ├── orchestrator.py   AI coach service with tool-calling
│   ├── db_setup.py       Database builder
│   ├── data/             Indian food source data (anuvaad.xlsx)
│   ├── requirements.txt  Backend dependencies
│   └── .env.example      Environment configuration template
├── frontend/             Next.js + TypeScript dashboard
│   ├── app/              Next.js app router pages & styles
│   ├── package.json      Frontend dependencies
│   └── .env.example      Frontend environment template
├── docker/               Docker entrypoint scripts
├── docs/                 Deployment and architecture guides
├── tests/                API smoke tests
└── nutrisync.db          Local SQLite database (gitignored)
```

## Docker

Run the entire NutriSync stack with Docker Compose:

```bash
docker compose up -d --build
```

- Backend API: `http://localhost:8000/health`
- Frontend Dashboard: `http://localhost:3000`

For full production deployment, GitHub Actions CI/CD, volume backup/restore, and scaling details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Run in GitHub Codespaces or Linux/macOS

First-time setup: The database is not committed to the repository and must be built once after cloning by running `python backend/db_setup.py` from the repository root.

Use two terminals. Do not commit `.env`, `.env.local`, `.venv`, `node_modules`, or `.next`.

### Terminal 1: backend

```bash
cd /workspaces/Nutrition_traker
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Creates nutrisync.db from backend/data/anuvaad.xlsx
python backend/db_setup.py
```

Edit `backend/.env` if you want coach chat:

```dotenv
# Fill ONE key, leave the other two blank (OpenRouter, Gemini or DeepSeek)
OPENROUTER_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
CORS_ORIGINS=http://localhost:3000
```

Start the API from the repository root:

```bash
python -m uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Verify the API:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","service":"NutriSync API","server_time":"2026-10-05 00:00:00"}
```

### Terminal 2: frontend

```bash
cd /workspaces/Nutrition_traker/frontend
cp .env.example .env.local
npm install
npm run dev -- --hostname 0.0.0.0
```

For a local browser, use this frontend environment value:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

In Codespaces, if the browser cannot reach the API through localhost, copy the forwarded port-8000 URL from the Ports panel into `frontend/.env.local`, for example:

```dotenv
NEXT_PUBLIC_API_URL=https://YOUR-CODESPACE-8000-URL.app.github.dev
```

Restart Next.js after changing `.env.local`. Open the forwarded port `3000` URL from the Codespaces Ports panel. The dashboard is on port `3000`; port `8000` is API-only, so `/` on port `8000` may return `404` while `/health` should return `200`.

## Run on Windows PowerShell

```powershell
cd path\to\Nutrition_traker
py -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
python backend\db_setup.py

cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Run the backend in a separate PowerShell terminal:

```powershell
cd path\to\Nutrition_traker
backend\.venv\Scripts\Activate.ps1
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

## API routes

- `GET /health`
- `GET /api/profile`
- `POST /api/profile/onboarding`
- `GET /api/overview`
- `GET /api/recent-meals`
- `POST /api/log-food`
- `GET /api/suggestions`
- `GET /api/patterns`
- `POST /api/chat`

## Database warning

nutrisync.db is not committed (it is gitignored), so run `python backend/db_setup.py` once after cloning; re-running it drops and recreates the application tables and deletes stored profile and meal data, so do not run it again on a database you want to keep.

## Security

The AI provider key must be supplied through `backend/.env` or deployment secrets. Never commit a real key. Any previously exposed key should be revoked and replaced.


## Reminders

Open **Reminders** in the sidebar, or tell the Coach, e.g. "remind me at 2 pm to eat 2 boiled eggs" or "remind me at 4 pm to drink water". At the set time NutriSync logs the food/water (untick *auto-log* for a nudge only) and notifies you.

Phone/email notifications are free and optional. Set them in `backend/.env`, then restart the backend, then press **Send test** on the Reminders page:

- **Phone push (recommended): Native Web Push (PWA, VAPID).** Delivers real lock-screen notifications directly to your phone via the web app without installing extra apps. HTTPS is required. On Android Chrome, it works directly; on iPhone, open Safari -> Share -> **Add to Home Screen** (iOS 16.4+). Generate VAPID keys with `python scripts/generate_vapid_keys.py`, configure `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `backend/.env`, and enable phone notifications in the app.
- **Email:** set `SMTP_USER`, `SMTP_PASSWORD` (a Gmail *App Password*, needs 2-step verification) and optionally `NOTIFY_EMAIL_TO`.
- **SMS/WhatsApp:** not included. There is no reliable free option for India (SMS needs DLT registration and paid credits).

Reminders are fired by the backend, so the backend must be running at that time. On Render's free plan the server sleeps after ~15 min idle and reminders only fire while it is awake, so add a free uptime pinger (e.g. UptimeRobot) hitting `https://<service>.onrender.com/health` every 5 minutes; reminders later than `REMINDER_GRACE_MINUTES` (default 15 min) are skipped by design. Set `TZ=Asia/Kolkata` for Docker/cloud so times match your clock (Linux/Docker/Render only; do NOT set `TZ` on Windows as Windows uses your system clock). Free cloud deployment instructions: see [docs/FREE_DEPLOYMENT.md](docs/FREE_DEPLOYMENT.md).