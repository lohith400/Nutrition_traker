# NutriSync API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# export variables from .env with your preferred dotenv loader or shell
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The API imports the repository's existing `math_engine`, `memory_agent`, `rag_resolver`, and `menu_planner` modules. It therefore reads and writes the repository SQLite database instead of returning demo values.

Never commit a real OpenRouter key. The key previously present in the CLI orchestrator must be revoked and replaced with an environment variable.
