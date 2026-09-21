# NutriSync

NutriSync is a nutrition coach for Indian food. It combines deterministic nutrition calculations with food matching, SQLite-backed meal history, meal suggestions, and an optional AI coach.

## Project structure

```text
.
├── backend/              FastAPI API adapter
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/             Next.js + TypeScript dashboard
│   ├── app/
│   ├── package.json
│   └── .env.example
├── data/                 Indian food source data
├── db_setup.py           Database builder
├── math_engine.py        Deterministic BMR, macro, and calorie logic
├── memory_agent.py       Profile, meal, and pattern persistence
├── rag_resolver.py       Food-name matching
├── menu_planner.py       Meal suggestions
├── orchestrator.py       Optional AI coach service
└── nutrisync.db          SQLite database
```

## Run in GitHub Codespaces or Linux/macOS

Use two terminals. Do not commit `.env`, `.env.local`, `.venv`, `node_modules`, or `.next`.

### Terminal 1: backend

```bash
cd /workspaces/Nutrition_traker
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env` if you want coach chat:

```dotenv
OPENROUTER_API_KEY=your-new-key
OPENROUTER_MODEL=openai/gpt-4o-mini
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
{"status":"ok","service":"NutriSync API"}
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

The checked-in SQLite database is used by the existing modules. Only run `python db_setup.py` if the required tables are missing. It drops and recreates application tables and can remove stored profile and meal data.

## Security

The AI provider key must be supplied through `backend/.env` or deployment secrets. Never commit a real key. Any previously exposed key should be revoked and replaced.
