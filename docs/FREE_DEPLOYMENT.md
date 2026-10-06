# Free deployment (no card): Turso + Render + Vercel -> use NutriSync on your phone 24/7

| Part | Service | Why |
|---|---|---|
| Database | **Turso** (free) | Your meals, profile and chat history live here, so nothing is lost when the free server restarts |
| Backend (FastAPI) | **Render** (free web service, Docker) | Runs `backend/Dockerfile` |
| Frontend (Next.js) | **Vercel** (free Hobby) | The page you open on your phone |

All three sign up with GitHub. Do the steps **in this order**.

> Turso's free plan today is 5 GB storage / 500M rows read / 10M rows written per month (the 9 GB figure is the paid Developer plan). Your database is about 1 MB, so this is far more than enough.

---

## 0. Push the code
New files were added (`backend/database.py`, `migrate_to_turso.py`, `check_db.py`, `render.yaml`, ...). Commit **everything**:

```bash
git add -A
git commit -m "Turso database, free deployment, PWA"
git push
```

## 1. Turso (database)
1. Go to https://turso.tech -> **Sign up with GitHub** (no card).
2. Create a database (e.g. `nutrisync`). Pick the location nearest to Singapore/India if offered (e.g. Mumbai or Singapore) -- the backend will run in Singapore.
3. Open the database -> copy its **URL** (looks like `libsql://nutrisync-yourname.turso.io`).
4. Create a **database token** (read & write, no expiry) and copy it. (Button names can differ slightly; CLI alternative: `turso db show --url nutrisync` and `turso db tokens create nutrisync`.)

### Load your tables and your existing data (once, from your laptop)
Use the Python 3.12 virtual environment you already use for the backend. PowerShell, from the project folder:

```powershell
pip install libsql
$env:TURSO_DATABASE_URL="libsql://nutrisync-yourname.turso.io"
$env:TURSO_AUTH_TOKEN="paste-token-here"

python backend/check_db.py                      # should end with "All good."
python backend/db_setup.py --if-needed          # creates tables + loads the ~1000 foods (takes a minute or two)
python backend/migrate_to_turso.py nutrisync.db # copies your existing meals/profile/chat history
```
Use the path of your real `nutrisync.db` (project root or `backend/`). You can run the migration again any time; it replaces rows, never deletes.
Skip the last command if you want to start fresh.

## 2. Render (backend)
1. https://render.com -> **Sign up with GitHub** (no card).
2. **New -> Blueprint** -> choose your repo (it reads `render.yaml`). *Or* **New -> Web Service** and set: Language **Docker**, Dockerfile path `./backend/Dockerfile`, Docker build context / Root Directory **empty (repo root)**, Region **Singapore**, Instance type **Free**. There is **no Start Command** to type -- the Docker image starts itself.
3. Environment variables:

| Name | Value |
|---|---|
| `PORT` | `10000` |
| `TURSO_DATABASE_URL` | the `libsql://...` URL |
| `TURSO_AUTH_TOKEN` | the token |
| `OPENROUTER_API_KEY` | your key (or `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` -- only one) |
| `ACCESS_KEY` | a long password you invent (protects your data and AI credits) |
| `VAPID_PUBLIC_KEY` | generated via `python scripts/generate_vapid_keys.py`, optional |
| `VAPID_PRIVATE_KEY` | generated private key, optional |
| `VAPID_CLAIM_EMAIL` | `mailto:you@example.com`, optional |
| `TZ` | `Asia/Kolkata` |
| `CORS_ORIGIN_REGEX` | `https://.*\.vercel\.app` |

4. Deploy. When it is live, open `https://<your-service>.onrender.com/health` -> `{"status":"ok",...}`. Copy this URL.

## 3. Vercel (frontend)
1. https://vercel.com -> **Sign up with GitHub** -> **Add New -> Project** -> import the repo.
2. **Root Directory: `frontend`**. Framework: Next.js (auto-detected).
3. Environment variable: `NEXT_PUBLIC_API_URL` = your Render URL (no trailing slash).
4. Deploy. You get `https://<name>.vercel.app`.
5. (Optional, stricter) In Render set `CORS_ORIGINS` to that exact Vercel URL.

`NEXT_PUBLIC_API_URL` is baked in at build time -- if you ever change it, **redeploy** the frontend.

## 4. Use it on your phone
Open the Vercel URL on your phone. The first time it asks for the **access key** (the `ACCESS_KEY` you set on Render); it is remembered on that device.

* **Android (Chrome):** menu (three dots) -> **Install app** / **Add to Home screen**. Web Push lock-screen notifications work directly once enabled on the Reminders page.
* **iPhone (must be Safari, iOS 16.4+):** Share button -> **Add to Home Screen**. You must open the installed Home Screen app to enable Web Push notifications.

HTTPS is automatic, so the mic, camera, location and Web Push notifications work.

---

## What to expect (free-tier honesty)
* **Sleeping:** Render's free service stops after 15 minutes without traffic; the first request afterwards takes about 30-60 seconds. Your data is safe in Turso either way.
* **Reminders on Render free:** on Render's free plan the server sleeps after ~15 min idle and reminders only fire while it is awake, so add a free uptime pinger (e.g. UptimeRobot) hitting `https://<service>.onrender.com/health` every 5 minutes; reminders later than `REMINDER_GRACE_MINUTES` (default 15 min) are skipped by design.
* **Speed:** every database query is now a network call to Turso. If screens feel slow, make sure the Turso location is close to Render's Singapore region.
* **Timezone on Windows:** Linux/Docker/Render uses `TZ=Asia/Kolkata`. Do NOT set `TZ` in `.env` on Windows; Windows already uses your system clock.
* **Chat memory:** every message is saved in Turso (`chat_messages`), and the last 20 turns (`CHAT_CONTEXT_MESSAGES`) are loaded for the coach on every request.
* Keep `ACCESS_KEY` secret and never commit your `.env`.
