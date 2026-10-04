import logging
import os
from datetime import datetime, time as dtime
from pathlib import Path

from dotenv import load_dotenv
import httpx

DIR = Path(__file__).resolve().parent
ROOT = DIR.parent
load_dotenv(DIR / ".env")
load_dotenv(ROOT / ".env")

logger = logging.getLogger("nutrisync.google_fit")

TOKEN_URL = "https://oauth2.googleapis.com/token"
FITNESS_URL = "https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate"


def _clean(val: str | None) -> str:
    v = (val or "").strip().strip('"').strip("'").strip()
    return "" if v.lower().startswith("your_") else v


def is_configured() -> bool:
    cid = _clean(os.getenv("GOOGLE_FIT_CLIENT_ID"))
    sec = _clean(os.getenv("GOOGLE_FIT_CLIENT_SECRET"))
    ref = _clean(os.getenv("GOOGLE_FIT_REFRESH_TOKEN"))
    return bool(cid and sec and ref)


async def get_fresh_access_token() -> str:
    """Uses the refresh token to silently obtain a valid access token."""
    cid = _clean(os.getenv("GOOGLE_FIT_CLIENT_ID"))
    sec = _clean(os.getenv("GOOGLE_FIT_CLIENT_SECRET"))
    ref = _clean(os.getenv("GOOGLE_FIT_REFRESH_TOKEN"))

    if not (cid and sec and ref):
        raise ValueError("Google Fit credentials are not configured in environment.")

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(
            TOKEN_URL,
            data={
                "client_id": cid,
                "client_secret": sec,
                "refresh_token": ref,
                "grant_type": "refresh_token",
            },
        )
        if res.status_code != 200:
            try:
                err_data = res.json()
                detail = err_data.get("error_description") or err_data.get("error") or res.text
            except Exception:
                detail = res.text
            raise RuntimeError(f"Google OAuth token refresh failed ({res.status_code}): {detail}")
        return res.json()["access_token"]


async def fetch_fitness_summary(target_date: datetime | None = None) -> dict:
    """
    Fetches daily steps, burned calories, and running minutes
    for a given date (defaults to today).
    """
    if target_date is None:
        target_date = datetime.now()

    date_str = target_date.strftime("%Y-%m-%d")

    if not is_configured():
        return {
            "status": "not_configured",
            "configured": False,
            "date": date_str,
            "steps": 0,
            "calories_burned": 0.0,
            "running_minutes": 0.0,
            "message": "Google Fit credentials not set in backend/.env",
        }

    try:
        # Midnight (00:00:00) to 23:59:59.999 in Unix milliseconds
        start_dt = datetime.combine(target_date.date(), dtime.min)
        end_dt = datetime.combine(target_date.date(), dtime.max)
        start_ms = int(start_dt.timestamp() * 1000)
        end_ms = int(end_dt.timestamp() * 1000)

        token = await get_fresh_access_token()

        payload = {
            "aggregateBy": [
                {"dataTypeName": "com.google.step_count.delta"},
                {"dataTypeName": "com.google.calories.expended"},
                {"dataTypeName": "com.google.activity.segment"},
            ],
            "bucketByTime": {"durationMillis": end_ms - start_ms},
            "startTimeMillis": start_ms,
            "endTimeMillis": end_ms,
        }

        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(FITNESS_URL, json=payload, headers=headers)
            if res.status_code != 200:
                try:
                    err_data = res.json()
                    detail = err_data.get("error", {}).get("message") or res.text
                except Exception:
                    detail = res.text
                raise RuntimeError(f"Google Fit API error ({res.status_code}): {detail}")
            data = res.json()

        steps = 0
        calories = 0.0
        running_minutes = 0.0

        buckets = data.get("bucket", [])
        if buckets:
            for dataset in buckets[0].get("dataset", []):
                for point in dataset.get("point", []):
                    dtype = point.get("dataTypeName")
                    for val in point.get("value", []):
                        # Steps
                        if dtype == "com.google.step_count.delta":
                            steps += val.get("intVal", 0)
                        # Calories
                        elif dtype == "com.google.calories.expended":
                            calories += val.get("fpVal", 0.0)
                        # Activity: Type 8 is Running in Google Fit
                        elif dtype == "com.google.activity.segment":
                            if val.get("intVal") == 8:
                                start_ns = int(point.get("startTimeNanos", 0))
                                end_ns = int(point.get("endTimeNanos", 0))
                                running_minutes += (end_ns - start_ns) / (1e9 * 60)

        return {
            "status": "ok",
            "configured": True,
            "date": date_str,
            "steps": steps,
            "calories_burned": round(calories, 1),
            "running_minutes": round(running_minutes, 1),
        }
    except Exception as e:
        logger.warning("Google Fit query error: %s", e)
        return {
            "status": "error",
            "configured": True,
            "date": date_str,
            "steps": 0,
            "calories_burned": 0.0,
            "running_minutes": 0.0,
            "error": str(e),
        }
