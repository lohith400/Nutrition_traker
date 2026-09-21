# NutriSync backend

FastAPI adapter for the repository's existing nutrition modules. It uses `math_engine.py`, `memory_agent.py`, `rag_resolver.py`, and `menu_planner.py` rather than returning demo data.

## GitHub Codespaces / Bash

From the repository root:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
python -m uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Test it with:

```bash
curl http://localhost:8000/health
```

## Environment

`backend/.env` is local-only and ignored by Git:

```dotenv
OPENROUTER_API_KEY=your-new-key
OPENROUTER_MODEL=openai/gpt-4o-mini
CORS_ORIGINS=http://localhost:3000
```

Coach chat returns a configuration error when `OPENROUTER_API_KEY` is empty. Profile, dashboard, food logging, suggestions, and patterns do not require the AI key.

## Windows PowerShell

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

The API root `/` is not a dashboard route and may return `404`. Use `/health` or the documented `/api/*` routes.
