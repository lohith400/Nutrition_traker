# NutriSync frontend

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

The frontend calls the FastAPI backend through `NEXT_PUBLIC_API_URL`. Restart the Next.js dev server after changing `.env.local`; environment variables are read when Next.js starts.
