# NutriSync backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

This backend provides the initial API layer for the premium nutrition dashboard. It is ready for connection to the existing Python nutrition logic once you want to wire in the actual modules from the repo.
