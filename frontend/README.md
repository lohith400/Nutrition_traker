# NutriSync frontend

Premium Next.js dashboard for the NutriSync FastAPI service.

## GitHub Codespaces / Bash

```bash
cd /workspaces/Nutrition_traker/frontend
cp .env.example .env.local
npm install
npm run dev -- --hostname 0.0.0.0
```

For local development:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

If the browser is using a Codespaces forwarded URL, set `NEXT_PUBLIC_API_URL` to the forwarded port-8000 URL from the Ports panel instead. Restart Next.js after changing it.

Open the forwarded port `3000` URL for the dashboard. Port `8000` is only the API.

## Windows PowerShell

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

The page reads live data from the API for profile, onboarding, overview, meals, food logging, suggestions, patterns, and coach chat. Never commit `.env.local`.
