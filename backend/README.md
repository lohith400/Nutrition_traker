# NutriSync local setup

## Backend (PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env and set OPENROUTER_API_KEY if you want coach chat.
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/health` before starting the frontend.

## Frontend (PowerShell)

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

The frontend uses `NEXT_PUBLIC_API_URL=http://localhost:8000`. If you use `127.0.0.1` for the API, change the frontend `.env.local` value accordingly and restart Next.js.
