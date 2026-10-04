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


try:
    from backend.database import get_db_connection
except ImportError:
    from database import get_db_connection


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
            "distance_km": 0.0,
            "active_minutes": 0.0,
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

        distance_km = round(steps * 0.00075, 2)
        active_minutes = round(running_minutes, 1)

        return {
            "status": "ok",
            "configured": True,
            "date": date_str,
            "steps": steps,
            "calories_burned": round(calories, 1),
            "running_minutes": round(running_minutes, 1),
            "distance_km": distance_km,
            "active_minutes": active_minutes,
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
            "distance_km": 0.0,
            "active_minutes": 0.0,
            "error": str(e),
        }


DB_PATH = None


def _get_conn():
    return get_db_connection(DB_PATH)


async def sync_today_fitness(target_date: datetime | None = None) -> dict:
    """
    Fetches the latest summary for today and upserts into daily_fitness.
    Ensures stored row and live Google Fit numbers stay synchronized.
    """
    summary = await fetch_fitness_summary(target_date)
    dt_str = summary.get("date") or datetime.now().strftime("%Y-%m-%d")
    steps = int(summary.get("steps") or 0)
    calories = float(summary.get("calories_burned") or 0.0)
    running_min = float(summary.get("running_minutes") or 0.0)
    distance_km = summary.get("distance_km")
    if distance_km is None and steps > 0:
        distance_km = round(steps * 0.00075, 2)
    active_min = summary.get("active_minutes") if summary.get("active_minutes") is not None else running_min
    synced_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = _get_conn()
    try:
        if summary.get("status") == "ok":
            conn.execute(
                """INSERT INTO daily_fitness (
                       log_date, steps, calories_burned, running_minutes,
                       distance_km, active_minutes, source, synced_at
                   ) VALUES (?, ?, ?, ?, ?, ?, 'google_fit', ?)
                   ON CONFLICT (log_date) DO UPDATE SET
                       steps = excluded.steps,
                       calories_burned = excluded.calories_burned,
                       running_minutes = excluded.running_minutes,
                       distance_km = excluded.distance_km,
                       active_minutes = excluded.active_minutes,
                       source = excluded.source,
                       synced_at = excluded.synced_at""",
                (dt_str, steps, calories, running_min, distance_km, active_min, synced_at),
            )
            conn.commit()
            summary["synced_at"] = synced_at
        else:
            # If Google API returned an error or not configured, check if we have a stored row
            row = conn.execute(
                "SELECT * FROM daily_fitness WHERE log_date = ?", (dt_str,)
            ).fetchone()
            if row:
                summary["stored_steps"] = row["steps"]
                summary["stored_calories_burned"] = row["calories_burned"]
                summary["stored_running_minutes"] = row["running_minutes"]
                summary["distance_km"] = row["distance_km"]
                summary["active_minutes"] = row["active_minutes"]
                summary["synced_at"] = row["synced_at"]
                # Keep steps/calories populated from stored data for UI continuity
                if steps == 0 and row["steps"]:
                    summary["steps"] = row["steps"]
                    summary["calories_burned"] = row["calories_burned"]
                    summary["running_minutes"] = row["running_minutes"]
    except Exception as exc:
        logger.warning("sync_today_fitness DB error: %s", exc)
    finally:
        conn.close()

    return summary


def sync_today_fitness_sync() -> dict:
    """Synchronous caller for background thread / scheduler."""
    import asyncio
    try:
        return asyncio.run(sync_today_fitness())
    except Exception as exc:
        logger.warning("sync_today_fitness_sync error: %s", exc)
        return {"status": "error", "error": str(exc)}


def get_fitness_history(days: int = 7) -> list[dict]:
    """Returns daily_fitness rows for the last N days (default 7, cap 30), oldest first."""
    num_days = max(1, min(int(days or 7), 30))
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT log_date, steps, calories_burned, running_minutes,
                      distance_km, active_minutes, source, synced_at
               FROM (
                   SELECT * FROM daily_fitness
                   ORDER BY log_date DESC
                   LIMIT ?
               ) ORDER BY log_date ASC""",
            (num_days,),
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_fitness_history error: %s", exc)
        return []
    finally:
        conn.close()


def get_today_stored_fitness(target_date: str | None = None) -> dict | None:
    """Reads today's row from daily_fitness without hitting Google API."""
    dt = target_date or datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        row = conn.execute(
            """SELECT log_date, steps, calories_burned, running_minutes,
                      distance_km, active_minutes, source, synced_at
               FROM daily_fitness WHERE log_date = ?""",
            (dt,),
        ).fetchone()
        return dict(row) if row else None
    except Exception as exc:
        logger.warning("get_today_stored_fitness error: %s", exc)
        return None
    finally:
        conn.close()

