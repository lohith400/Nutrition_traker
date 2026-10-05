import json
import logging
import os
import time
from datetime import datetime, time as dtime, timedelta
from pathlib import Path
import sqlite3

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



# ---------------------------------------------------------------------------
# Extra Google Fit data (heart rate, sleep, distance, heart points, weight...)
# Every group is fetched in its OWN request and fully fault-tolerant: if the
# refresh token lacks a scope (e.g. body / sleep / location) only that group is
# skipped and reported in extras["missing"] -- the core steps/calories sync is
# never affected.
# ---------------------------------------------------------------------------
GROUPS = {
    "activity": ["com.google.active_minutes", "com.google.heart_minutes", "com.google.activity.segment"],
    "location": ["com.google.distance.delta"],
    "body": ["com.google.heart_rate.bpm", "com.google.weight"],
    "sleep": ["com.google.sleep.segment"],
}
SCOPE_FOR = {
    "activity": "fitness.activity.read",
    "location": "fitness.location.read",
    "body": "fitness.body.read",
    "sleep": "fitness.sleep.read",
}
ACTIVITY_NAMES = {
    1: "Cycling", 2: "On foot", 7: "Walking", 8: "Running", 9: "Aerobics", 10: "Badminton",
    12: "Basketball", 29: "Football", 80: "Strength training", 100: "Yoga",
}
IGNORED_ACTIVITIES = {0, 3, 4, 5, 72, 109, 110, 111, 112}  # vehicle, still, unknown, tilting, sleep
SLEEP_STAGES = {2, 4, 5, 6}  # sleep, light, deep, REM  (1 = awake, 3 = out of bed)
_EXTRAS_CACHE: dict = {}
_EXTRAS_TTL = 60.0


async def _aggregate(token: str, types: list[str], start_ms: int, end_ms: int, bucket_ms: int) -> list:
    payload = {
        "aggregateBy": [{"dataTypeName": t} for t in types],
        "bucketByTime": {"durationMillis": bucket_ms},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        res = await client.post(FITNESS_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
    if res.status_code != 200:
        raise RuntimeError(f"Google Fit API error ({res.status_code})")
    return res.json().get("bucket", [])


def _points(bucket: dict):
    for ds in bucket.get("dataset", []):
        for p in ds.get("point", []):
            yield p.get("dataTypeName") or "", p


def _parse_group(group: str, bucket: dict) -> dict:
    out: dict = {}
    if group == "activity":
        move, hp, acts = 0, 0.0, {}
        for dtype, p in _points(bucket):
            vals = p.get("value", [])
            if dtype == "com.google.active_minutes" and vals:
                move += vals[0].get("intVal", 0)
            elif dtype == "com.google.heart_minutes" and vals:
                hp += vals[0].get("fpVal", 0.0)
            elif dtype == "com.google.activity.segment" and vals:
                t = vals[0].get("intVal")
                if t in IGNORED_ACTIVITIES:
                    continue
                ms = vals[1].get("intVal", 0) if len(vals) > 1 else (
                    (int(p.get("endTimeNanos", 0)) - int(p.get("startTimeNanos", 0))) / 1e6)
                name = ACTIVITY_NAMES.get(t, "Other activity")
                acts[name] = acts.get(name, 0.0) + ms / 60000.0
        out["move_minutes"] = int(move)
        out["heart_points"] = round(hp, 1)
        out["activities"] = {k: round(v, 1) for k, v in acts.items() if v >= 1}
    elif group == "location":
        meters = sum(v.get("fpVal", 0.0) for _, p in _points(bucket) for v in p.get("value", [])[:1])
        out["distance_km"] = round(meters / 1000.0, 2)
    elif group == "body":
        for dtype, p in _points(bucket):
            vals = p.get("value", [])
            if dtype == "com.google.heart_rate.bpm" and len(vals) >= 3:
                out["hr_avg"], out["hr_max"], out["hr_min"] = (round(vals[i].get("fpVal", 0.0)) for i in range(3))
            elif dtype == "com.google.weight" and vals:
                out["weight_kg"] = round(vals[0].get("fpVal", 0.0), 1)
    elif group == "sleep":
        mins = 0.0
        for _, p in _points(bucket):
            vals = p.get("value", [])
            if vals and vals[0].get("intVal") in SLEEP_STAGES:
                mins += (int(p.get("endTimeNanos", 0)) - int(p.get("startTimeNanos", 0))) / 6e10
        out["sleep_minutes"] = int(round(mins))
    return out


async def fetch_extras(token: str, target_date: datetime) -> dict:
    """Heart rate / sleep / distance / heart points / weight / activity mix for one day."""
    key = target_date.strftime("%Y-%m-%d")
    hit = _EXTRAS_CACHE.get(key)
    if hit and time.time() - hit[0] < _EXTRAS_TTL:
        return hit[1]
    day0 = datetime.combine(target_date.date(), dtime.min)
    day_ms = 86_400_000
    windows = {g: (int(day0.timestamp() * 1000), int(day0.timestamp() * 1000) + day_ms) for g in GROUPS}
    # last night's sleep: previous 18:00 -> today 18:00
    windows["sleep"] = (windows["sleep"][0] - 6 * 3_600_000, windows["sleep"][0] + 18 * 3_600_000)
    extras: dict = {"missing": []}
    for group, types in GROUPS.items():
        try:
            start_ms, end_ms = windows[group]
            buckets = await _aggregate(token, types, start_ms, end_ms, end_ms - start_ms)
            if buckets:
                extras.update(_parse_group(group, buckets[0]))
        except Exception as exc:  # scope missing / no data / network: skip this group only
            logger.info("Google Fit extras group %s skipped: %s", group, exc)
            extras["missing"].append(group)
    _EXTRAS_CACHE[key] = (time.time(), extras)
    return extras


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
        distance_source = "estimated"
        active_minutes = round(running_minutes, 1)

        extras: dict = {}
        try:
            extras = await fetch_extras(token, target_date)
            if (extras.get("distance_km") or 0) > 0:
                distance_km = extras["distance_km"]
                distance_source = "google_fit"
            if (extras.get("move_minutes") or 0) > 0:
                active_minutes = float(extras["move_minutes"])
        except Exception as exc:
            logger.info("Google Fit extras skipped: %s", exc)

        return {
            "extras": extras,
            "distance_source": distance_source,
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
    conn = get_db_connection(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn



def _upsert_day(conn, log_date, steps, calories, running_min, distance_km, active_min, extras, synced_at):
    """Insert/update one daily_fitness row. Falls back to the original column set if the
    `extras` column does not exist yet, so a not-yet-migrated DB keeps working."""
    base = (log_date, steps, calories, running_min, distance_km, active_min)
    try:
        conn.execute(
            """INSERT INTO daily_fitness (
                   log_date, steps, calories_burned, running_minutes,
                   distance_km, active_minutes, source, synced_at, extras
               ) VALUES (?, ?, ?, ?, ?, ?, 'google_fit', ?, ?)
               ON CONFLICT (log_date) DO UPDATE SET
                   steps = excluded.steps,
                   calories_burned = excluded.calories_burned,
                   running_minutes = excluded.running_minutes,
                   distance_km = excluded.distance_km,
                   active_minutes = excluded.active_minutes,
                   source = excluded.source,
                   synced_at = excluded.synced_at,
                   extras = excluded.extras""",
            base + (synced_at, json.dumps(extras or {})),
        )
    except Exception:
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
            base + (synced_at,),
        )


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
            _upsert_day(conn, dt_str, steps, calories, running_min, distance_km, active_min,
                        summary.get("extras") or {}, synced_at)
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
                try:
                    summary["extras"] = json.loads(row["extras"] or "{}")
                except Exception:
                    summary["extras"] = {}
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
    """Returns daily_fitness rows for the last N days (default 7, cap 30), oldest first.
    Each row carries parsed `extras` (heart rate, sleep, ...) when available."""
    num_days = max(1, min(int(days or 7), 30))
    conn = _get_conn()
    try:
        for cols in ("distance_km, active_minutes, source, synced_at, extras",
                     "distance_km, active_minutes, source, synced_at"):
            try:
                rows = conn.execute(
                    f"""SELECT log_date, steps, calories_burned, running_minutes, {cols}
                        FROM (SELECT * FROM daily_fitness ORDER BY log_date DESC LIMIT ?)
                        ORDER BY log_date ASC""",
                    (num_days,),
                ).fetchall()
                break
            except Exception:
                rows = None
        out = []
        for r in rows or []:
            d = dict(r)
            try:
                d["extras"] = json.loads(d.get("extras") or "{}")
            except Exception:
                d["extras"] = {}
            out.append(d)
        return out
    except Exception as exc:
        logger.warning("get_fitness_history error: %s", exc)
        return []
    finally:
        conn.close()


async def sync_range(days: int = 14) -> dict:
    """Backfill the last N days (cap 30) from Google Fit so history/trends are complete
    even for days the app was not opened. Safe to call repeatedly (upserts)."""
    n = max(1, min(int(days or 14), 30))
    if not is_configured():
        return {"status": "not_configured", "synced_days": 0}
    try:
        token = await get_fresh_access_token()
        today0 = datetime.combine(datetime.now().date(), dtime.min)
        first0 = today0 - timedelta(days=n - 1)
        start_ms = int(first0.timestamp() * 1000)
        end_ms = int(datetime.now().timestamp() * 1000)
        day_ms = 86_400_000
        core = await _aggregate(
            token,
            ["com.google.step_count.delta", "com.google.calories.expended", "com.google.activity.segment"],
            start_ms, end_ms, day_ms,
        )
        per_day: dict = {}
        for b in core:
            d = datetime.fromtimestamp(int(b["startTimeMillis"]) / 1000).strftime("%Y-%m-%d")
            steps, cal, run = 0, 0.0, 0.0
            for dtype, p in _points(b):
                for v in p.get("value", []):
                    if dtype == "com.google.step_count.delta":
                        steps += v.get("intVal", 0)
                    elif dtype == "com.google.calories.expended":
                        cal += v.get("fpVal", 0.0)
                    elif dtype == "com.google.activity.segment" and v.get("intVal") == 8:
                        run += (int(p.get("endTimeNanos", 0)) - int(p.get("startTimeNanos", 0))) / 6e10
            per_day[d] = {"steps": steps, "cal": cal, "run": run, "extras": {"missing": []}}

        for group, types in GROUPS.items():
            try:
                g_start = start_ms - (6 * 3_600_000 if group == "sleep" else 0)
                g_end = end_ms if group != "sleep" else end_ms + 6 * 3_600_000
                for b in await _aggregate(token, types, g_start, g_end, day_ms):
                    t0 = int(b["startTimeMillis"]) / 1000
                    if group == "sleep":
                        t0 += 6 * 3600  # bucket starts 18:00 the evening before -> label by wake-up date
                    d = datetime.fromtimestamp(t0).strftime("%Y-%m-%d")
                    if d in per_day:
                        per_day[d]["extras"].update(_parse_group(group, b))
            except Exception as exc:
                logger.info("Backfill group %s skipped: %s", group, exc)
                for rec in per_day.values():
                    rec["extras"]["missing"].append(group)

        conn = _get_conn()
        written = 0
        try:
            stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            for d, rec in per_day.items():
                if rec["steps"] <= 0 and rec["cal"] <= 0:
                    continue
                ex = rec["extras"]
                dist = ex.get("distance_km") or round(rec["steps"] * 0.00075, 2)
                active = float(ex.get("move_minutes") or round(rec["run"], 1))
                _upsert_day(conn, d, int(rec["steps"]), round(rec["cal"], 1), round(rec["run"], 1),
                            dist, active, ex, stamp)
                written += 1
            conn.commit()
        finally:
            conn.close()
        return {"status": "ok", "synced_days": written}
    except Exception as exc:
        logger.warning("sync_range error: %s", exc)
        return {"status": "error", "error": str(exc), "synced_days": 0}


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

