"""
Memory Agent
=============
Owns the database. Three jobs:
  1. Short-term memory: log today's meals, read today's totals.
  2. Long-term memory (patterns): look across multiple days and detect
     recurring issues (e.g. "low breakfast protein, 3 days running").
  3. Long-term memory (preferences & facts): remember which foods the user
     actually eats and how often (food_preferences), and explicit facts
     they've told the coach, like their diet (user_facts) -- so the coach
     and the menu planner get smarter about this specific person over time
     instead of starting from zero every conversation.

This agent does NOT do arithmetic itself for meal totals (that's the
Math Engine's job) -- it only stores what the Math Engine already
calculated, and reasons about trends across stored history.
"""

import json as _json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta

try:
    from backend.database import get_db_connection
except ImportError:  # run from inside backend/
    from database import get_db_connection

_logger = logging.getLogger(__name__)

_DEFAULT_DB = (
    os.path.join(os.path.dirname(__file__), "..", "nutrisync.db")
    if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "nutrisync.db"))
    else os.path.join(os.path.dirname(__file__), "nutrisync.db")
)
DB_PATH = os.getenv("NUTRISYNC_DB_PATH", _DEFAULT_DB)

_water_table_ensured = False
_water_table_lock = threading.Lock()

_chat_table_ensured = False
_chat_table_lock = threading.Lock()

_patterns_write_lock = threading.Lock()
_last_patterns_detection_ts = 0.0


def _get_conn():
    conn = get_db_connection(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


_profile_photo_ensured = False
_profile_photo_lock = threading.Lock()


def _ensure_profile_photo_column(conn) -> None:
    global _profile_photo_ensured
    if _profile_photo_ensured:
        return
    with _profile_photo_lock:
        if _profile_photo_ensured:
            return
        cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)").fetchall()}
        if "photo_data" not in cols:
            conn.execute("ALTER TABLE user_profile ADD COLUMN photo_data TEXT")
            conn.commit()
        _profile_photo_ensured = True


# ---------- User profile ----------

def save_user_profile(profile: dict) -> dict:
    """
    Called once during onboarding (and again if the user updates their
    profile). profile must include the raw answers AND the calculated
    targets (from math_engine.calculate_bmr_tdee / calculate_targets).
    """
    conn = _get_conn()
    try:
        _ensure_profile_photo_column(conn)
        profile = {**profile, "diet": profile.get("diet") or "any"}
        if "photo_data" not in profile:
            cur = conn.execute("SELECT photo_data FROM user_profile WHERE id = 1").fetchone()
            profile["photo_data"] = cur["photo_data"] if cur and "photo_data" in cur.keys() else None
        conn.execute(
            """INSERT OR REPLACE INTO user_profile
               (id, name, age, sex, height_cm, current_weight_kg, target_weight_kg,
                goal, activity_level, allergies, medical_conditions, sleep_schedule,
                diet, bmr_kcal, tdee_kcal, target_calories, target_protein_g,
                target_carbs_g, target_fat_g, target_water_l, onboarded_at, photo_data)
               VALUES (1, :name, :age, :sex, :height_cm, :current_weight_kg, :target_weight_kg,
                       :goal, :activity_level, :allergies, :medical_conditions, :sleep_schedule,
                       :diet, :bmr_kcal, :tdee_kcal, :target_calories, :target_protein_g,
                       :target_carbs_g, :target_fat_g, :target_water_l, :onboarded_at, :photo_data)""",
            profile,
        )
        conn.commit()
        return {"status": "saved"}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_profile_photo(photo_data: str | None) -> dict:
    conn = _get_conn()
    try:
        _ensure_profile_photo_column(conn)
        conn.execute("UPDATE user_profile SET photo_data = ? WHERE id = 1", (photo_data,))
        conn.commit()
        return {"status": "ok", "photo_data": photo_data}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_user_profile() -> dict:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        if row is None:
            return {"status": "not_onboarded"}
        return dict(row)
    finally:
        conn.close()


def get_user_diet() -> str:
    """Convenience accessor used by rag_resolver / menu_planner callers."""
    profile = get_user_profile()
    return profile.get("diet") or "any"


# ---------- Daily logs (short-term memory) ----------

def log_meal(meal_type: str, food_code: str, food_name: str, quantity: float,
             calories: float, protein_g: float, carbs_g: float, fat_g: float,
             unit: str = "serving", serving_label: str | None = None,
             log_date: str | None = None) -> dict:
    """
    Saves one logged food item immediately, and updates the long-term
    food_preferences row for this food so the system learns what the user
    actually eats (used by the menu planner's familiarity ranking and by
    detect_patterns).
    """
    now = datetime.now()
    date_str = log_date or now.strftime("%Y-%m-%d")
    if log_date and log_date != now.strftime("%Y-%m-%d"):
        # Logging for an earlier day ("I forgot to log yesterday's lunch"): park it at a mealtime of that day.
        stamp = f"{date_str} " + {"breakfast": "08:30:00", "lunch": "13:00:00", "snack": "17:00:00", "dinner": "20:00:00"}.get(meal_type, "12:00:00")
    else:
        stamp = now.strftime("%Y-%m-%d %H:%M:%S")
    conn = _get_conn()
    try:
        cur = conn.execute(
            """INSERT INTO daily_logs
               (log_date, log_time, meal_type, food_code, food_name, quantity,
                calories, protein_g, carbs_g, fat_g, unit, serving_label)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (date_str, stamp, meal_type,
             food_code, food_name, quantity, calories, protein_g, carbs_g, fat_g,
             unit, serving_label),
        )
        log_id = cur.lastrowid
        if food_code:
            col = {"breakfast": "breakfast_count", "lunch": "lunch_count",
                   "dinner": "dinner_count", "snack": "snack_count"}.get(meal_type, "snack_count")
            counts = {"breakfast_count": 0, "lunch_count": 0, "dinner_count": 0, "snack_count": 0, col: 1}
            conn.execute(
                f"""INSERT INTO food_preferences
                    (food_code, food_name, times_logged, first_eaten, last_eaten,
                     breakfast_count, lunch_count, dinner_count, snack_count, total_amount, grams_count)
                    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(food_code) DO UPDATE SET
                        times_logged = times_logged + 1,
                        last_eaten = excluded.last_eaten,
                        {col} = {col} + 1,
                        total_amount = total_amount + excluded.total_amount,
                        grams_count = grams_count + excluded.grams_count""",
                (food_code, food_name, date_str, date_str,
                 counts["breakfast_count"], counts["lunch_count"], counts["dinner_count"], counts["snack_count"],
                 quantity, 1 if unit == "grams" else 0),
            )
        conn.commit()
        return {"status": "logged", "date": date_str, "log_id": log_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_todays_logs() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT log_id, food_code, log_time, meal_type, food_name, quantity, unit, serving_label, calories, protein_g, carbs_g, fat_g "
            "FROM daily_logs WHERE log_date = ? ORDER BY log_time", (today,),
        ).fetchall()
        return {"date": today, "meals": [dict(r) for r in rows]}
    finally:
        conn.close()


def get_logs_history(days: int = 14) -> list:
    """Every logged meal for the last `days` days, grouped by date (most
    recent first), each with that day's totals."""
    since = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT log_id, food_code, log_date, log_time, meal_type, food_name, quantity, unit, serving_label, "
            "calories, protein_g, carbs_g, fat_g FROM daily_logs WHERE log_date >= ? "
            "ORDER BY log_date DESC, log_time ASC",
            (since,),
        ).fetchall()
    finally:
        conn.close()

    by_date: dict = {}
    for r in rows:
        d = r["log_date"]
        entry = by_date.setdefault(d, {
            "date": d, "meals": [],
            "total_calories": 0.0, "total_protein_g": 0.0, "total_carbs_g": 0.0, "total_fat_g": 0.0,
        })
        entry["meals"].append(dict(r))
        entry["total_calories"] += r["calories"] or 0
        entry["total_protein_g"] += r["protein_g"] or 0
        entry["total_carbs_g"] += r["carbs_g"] or 0
        entry["total_fat_g"] += r["fat_g"] or 0

    ordered = sorted(by_date.values(), key=lambda x: x["date"], reverse=True)
    for entry in ordered:
        entry["total_calories"] = round(entry["total_calories"], 1)
        entry["total_protein_g"] = round(entry["total_protein_g"], 1)
        entry["total_carbs_g"] = round(entry["total_carbs_g"], 1)
        entry["total_fat_g"] = round(entry["total_fat_g"], 1)
    return ordered


# ---------- Editing / removing log entries ----------

def get_log(log_id: int) -> dict | None:
    conn = _get_conn()
    try:
        r = conn.execute("SELECT * FROM daily_logs WHERE log_id = ?", (int(log_id),)).fetchone()
        return dict(r) if r else None
    finally:
        conn.close()


def _forget_preference(conn, row) -> None:
    """Keep the long-term food habits in step when an entry is removed."""
    code = row["food_code"]
    if not code:
        return
    col = {"breakfast": "breakfast_count", "lunch": "lunch_count", "dinner": "dinner_count"}.get(row["meal_type"], "snack_count")
    pref = conn.execute("SELECT times_logged FROM food_preferences WHERE food_code = ?", (code,)).fetchone()
    if not pref:
        return
    if (pref["times_logged"] or 0) <= 1:
        conn.execute("DELETE FROM food_preferences WHERE food_code = ?", (code,))
    else:
        conn.execute(f"UPDATE food_preferences SET times_logged = times_logged - 1, {col} = MAX({col} - 1, 0) WHERE food_code = ?", (code,))


def delete_log(log_id: int) -> bool:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM daily_logs WHERE log_id = ?", (int(log_id),)).fetchone()
        if row is None:
            return False
        conn.execute("DELETE FROM daily_logs WHERE log_id = ?", (int(log_id),))
        _forget_preference(conn, row)
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_log(log_id: int, meal_type: str, quantity: float, unit: str, serving_label: str | None,
               calories: float, protein_g: float, carbs_g: float, fat_g: float) -> bool:
    conn = _get_conn()
    try:
        cur = conn.execute(
            "UPDATE daily_logs SET meal_type=?, quantity=?, unit=?, serving_label=?, calories=?, protein_g=?, carbs_g=?, fat_g=? WHERE log_id=?",
            (meal_type, quantity, unit, serving_label, calories, protein_g, carbs_g, fat_g, int(log_id)),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------- Weight tracking ----------

_weight_table_ensured = False


def _ensure_weight_table(conn) -> None:
    global _weight_table_ensured
    if _weight_table_ensured:
        return
    conn.execute(
        """CREATE TABLE IF NOT EXISTS weight_logs (
               log_date TEXT PRIMARY KEY, weight_kg REAL NOT NULL, note TEXT, logged_at TEXT NOT NULL)"""
    )
    conn.commit()
    _weight_table_ensured = True


def log_weight(weight_kg: float, log_date: str | None = None, note: str | None = None) -> dict:
    """One reading per day; logging again the same day replaces it."""
    now = datetime.now()
    day = log_date or now.strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        _ensure_weight_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO weight_logs (log_date, weight_kg, note, logged_at) VALUES (?, ?, ?, ?)",
            (day, float(weight_kg), (note or None), now.strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return {"status": "logged", "date": day, "weight_kg": float(weight_kg)}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_weights(days: int = 90) -> list:
    since = (datetime.now() - timedelta(days=max(days, 1) - 1)).strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        _ensure_weight_table(conn)
        rows = conn.execute(
            "SELECT log_date, weight_kg, note FROM weight_logs WHERE log_date >= ? ORDER BY log_date ASC", (since,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_weight(log_date: str) -> bool:
    conn = _get_conn()
    try:
        _ensure_weight_table(conn)
        cur = conn.execute("DELETE FROM weight_logs WHERE log_date = ?", (log_date,))
        conn.commit()
        return (cur.rowcount or 0) > 0
    finally:
        conn.close()


# ---------- Water tracking ----------

def _ensure_water_table(conn) -> None:
    global _water_table_ensured
    if _water_table_ensured:
        return
    with _water_table_lock:
        if _water_table_ensured:
            return
        conn.execute(
            """CREATE TABLE IF NOT EXISTS water_logs (
                   log_id   INTEGER PRIMARY KEY AUTOINCREMENT,
                   log_date TEXT NOT NULL,
                   log_time TEXT NOT NULL,
                   amount_l REAL NOT NULL
               )"""
        )
        conn.commit()
        _water_table_ensured = True


def log_water(amount_l: float) -> dict:
    now = datetime.now()
    conn = _get_conn()
    try:
        _ensure_water_table(conn)
        conn.execute(
            "INSERT INTO water_logs (log_date, log_time, amount_l) VALUES (?, ?, ?)",
            (now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S"), amount_l),
        )
        conn.commit()
        return {"status": "logged"}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_todays_water() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    try:
        _ensure_water_table(conn)
        row = conn.execute(
            "SELECT COALESCE(SUM(amount_l),0) as total FROM water_logs WHERE log_date = ?", (today,)
        ).fetchone()
        return {"date": today, "consumed_water_l": round(row["total"], 2)}
    finally:
        conn.close()


# ---------- Long-term memory: pattern detection ----------

def _upsert_pattern(conn, pattern_type: str, description: str) -> None:
    """One row per pattern_type: refresh the description/date instead of
    piling up a new row every time detect_patterns runs (it used to insert
    a fresh row on every single chat turn)."""
    conn.execute(
        """INSERT INTO detected_patterns (detected_on, pattern_type, description, still_active)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(pattern_type) DO UPDATE SET
               detected_on = excluded.detected_on,
               description = excluded.description,
               still_active = 1""",
        (datetime.now().strftime("%Y-%m-%d"), pattern_type, description),
    )


def _deactivate_pattern(conn, pattern_type: str) -> None:
    conn.execute("UPDATE detected_patterns SET still_active = 0 WHERE pattern_type = ?", (pattern_type,))


def detect_patterns() -> dict:
    """
    Looks across the last 7-14 days of logs and checks for recurring
    issues and habits. This is what turns the system from "a calculator
    that forgets everything" into something that sounds like it actually
    knows the user's habits.
    """
    with _patterns_write_lock:
        conn = _get_conn()
        try:
            profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
            if profile is None:
                return {"status": "not_onboarded"}

            seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            new_patterns = []

            # Pattern 1: consistently low breakfast protein
            breakfast_protein = conn.execute(
                """SELECT log_date, COALESCE(SUM(protein_g),0) as protein
                   FROM daily_logs WHERE meal_type = 'breakfast' AND log_date >= ?
                   GROUP BY log_date ORDER BY log_date DESC""",
                (seven_days_ago,),
            ).fetchall()
            low_protein_days = [r["log_date"] for r in breakfast_protein if r["protein"] < 10]
            if len(low_protein_days) >= 3:
                desc = f"Breakfast protein has been under 10g on {len(low_protein_days)} of the last 7 days."
                _upsert_pattern(conn, "low_protein_breakfast", desc)
                new_patterns.append(desc)
            else:
                _deactivate_pattern(conn, "low_protein_breakfast")

            # Pattern 2: favourite foods (top 3 most-logged, at least 3 times)
            favourites = conn.execute(
                "SELECT food_name, times_logged FROM food_preferences WHERE times_logged >= 3 "
                "ORDER BY times_logged DESC LIMIT 3"
            ).fetchall()
            if favourites:
                names = ", ".join(f"{f['food_name']} ({f['times_logged']}x)" for f in favourites)
                desc = f"Regularly logged foods: {names}."
                _upsert_pattern(conn, "favourite_foods", desc)
                new_patterns.append(desc)
            else:
                _deactivate_pattern(conn, "favourite_foods")

            # Pattern 3: calories consistently under or over target
            daily_totals = conn.execute(
                """SELECT log_date, COALESCE(SUM(calories),0) as cal FROM daily_logs
                   WHERE log_date >= ? GROUP BY log_date""",
                (seven_days_ago,),
            ).fetchall()
            target = profile["target_calories"] or 0
            if target and len(daily_totals) >= 3:
                under_days = sum(1 for r in daily_totals if r["cal"] < target * 0.8)
                over_days = sum(1 for r in daily_totals if r["cal"] > target * 1.15)
                if under_days >= 3:
                    desc = f"Calorie intake has been at least 20% under target on {under_days} of the last {len(daily_totals)} logged days."
                    _upsert_pattern(conn, "under_eating", desc)
                    new_patterns.append(desc)
                else:
                    _deactivate_pattern(conn, "under_eating")
                if over_days >= 3:
                    desc = f"Calorie intake has been at least 15% over target on {over_days} of the last {len(daily_totals)} logged days."
                    _upsert_pattern(conn, "over_eating", desc)
                    new_patterns.append(desc)
                else:
                    _deactivate_pattern(conn, "over_eating")

            # Pattern 4: low_activity_week (average daily steps over last 7 days of daily_fitness below sedentary threshold)
            try:
                fitness_rows = conn.execute(
                    """SELECT log_date, steps, calories_burned FROM daily_fitness
                       WHERE log_date >= ? ORDER BY log_date DESC""",
                    (seven_days_ago,),
                ).fetchall()
            except Exception:
                fitness_rows = []

            if len(fitness_rows) >= 3:
                avg_steps = sum(r["steps"] or 0 for r in fitness_rows) / len(fitness_rows)
                if avg_steps < 5000:
                    desc = f"Average daily steps over the last {len(fitness_rows)} tracked days is {int(avg_steps):,} steps (below sedentary threshold of 5,000 steps)."
                    _upsert_pattern(conn, "low_activity_week", desc)
                    new_patterns.append(desc)
                else:
                    _deactivate_pattern(conn, "low_activity_week")
            else:
                _deactivate_pattern(conn, "low_activity_week")

            # Pattern 5: active_day_undereating (on days with high calories_burned, intake was well under target_calories)
            if target and fitness_rows and daily_totals:
                cal_map = {r["log_date"]: r["cal"] for r in daily_totals}
                active_under_count = 0
                total_active_days = 0
                for fr in fitness_rows:
                    dt = fr["log_date"]
                    burned = fr["calories_burned"] or 0
                    steps = fr["steps"] or 0
                    if (burned >= 400 or steps >= 8000) and dt in cal_map:
                        total_active_days += 1
                        if cal_map[dt] < target * 0.8:
                            active_under_count += 1
                if total_active_days >= 2 and active_under_count >= 2:
                    desc = f"On {active_under_count} high-activity days recently, logged calorie intake was over 20% below target — remember to replenish energy and nutrients after workouts."
                    _upsert_pattern(conn, "active_day_undereating", desc)
                    new_patterns.append(desc)
                else:
                    _deactivate_pattern(conn, "active_day_undereating")
            else:
                _deactivate_pattern(conn, "active_day_undereating")

            conn.commit()
            return {"status": "checked", "new_patterns": new_patterns}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def maybe_detect_patterns(force: bool = False) -> dict:
    """Run detect_patterns at most once every 10 minutes unless force=True (e.g. after logging a meal).
    Wrapped in try/except so failures only log a warning and do not raise."""
    global _last_patterns_detection_ts
    now = time.time()
    if not force and (now - _last_patterns_detection_ts < 600):
        return {"status": "throttled"}
    try:
        res = detect_patterns()
        _last_patterns_detection_ts = time.time()
        return res
    except Exception as exc:
        _logger.warning("detect_patterns failed: %s", exc)
        return {"status": "failed", "error": str(exc)}


def get_active_patterns() -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT pattern_type, description, detected_on FROM detected_patterns "
            "WHERE still_active = 1 ORDER BY detected_on DESC LIMIT 5"
        ).fetchall()
        return {"patterns": [dict(r) for r in rows]}
    finally:
        conn.close()


# ---------- Long-term memory: food preferences ----------

def get_food_preferences(limit: int = 10) -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT food_code, food_name, times_logged, first_eaten, last_eaten, "
            "breakfast_count, lunch_count, dinner_count, snack_count "
            "FROM food_preferences ORDER BY times_logged DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return {"foods": [dict(r) for r in rows]}
    finally:
        conn.close()


# ---------- Long-term memory: explicit user facts ----------

def set_user_fact(key: str, value: str) -> dict:
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO user_facts (fact_key, fact_value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(fact_key) DO UPDATE SET fact_value = excluded.fact_value, updated_at = excluded.updated_at""",
            (key, value, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return {"status": "saved"}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_user_facts() -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute("SELECT fact_key, fact_value, updated_at FROM user_facts").fetchall()
        return {r["fact_key"]: r["fact_value"] for r in rows}
    finally:
        conn.close()


# ---------- Coach chat history ----------
# The conversational coach (see orchestrator.chat_with_tools) needs its
# transcript to survive page refreshes and server restarts, so it lives in
# the same SQLite database as everything else rather than in memory.

def _ensure_chat_table(conn) -> None:
    global _chat_table_ensured
    if _chat_table_ensured:
        return
    with _chat_table_lock:
        if _chat_table_ensured:
            return
        conn.execute(
            """CREATE TABLE IF NOT EXISTS chat_messages (
                   msg_id     INTEGER PRIMARY KEY AUTOINCREMENT,
                   role       TEXT NOT NULL,
                   content    TEXT NOT NULL,
                   tool_events TEXT,
                   created_at TEXT NOT NULL
               )"""
        )
        conn.commit()
        _chat_table_ensured = True


def save_chat_message(role: str, content: str, tool_events=None) -> dict:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _get_conn()
    try:
        _ensure_chat_table(conn)
        conn.execute(
            "INSERT INTO chat_messages (role, content, tool_events, created_at) VALUES (?, ?, ?, ?)",
            (role, content, _json.dumps(tool_events) if tool_events else None, now),
        )
        conn.commit()
        return {"status": "saved"}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def get_chat_history(limit: int = 500, date: str | None = None) -> list:
    """Chat transcript, oldest first. With `date` (YYYY-MM-DD) only that day's
    conversation is returned -- each day is its own chat page. Without it,
    everything is returned (kept for backward compatibility)."""
    conn = _get_conn()
    try:
        _ensure_chat_table(conn)
        if date:
            rows = conn.execute(
                "SELECT role, content, tool_events, created_at FROM chat_messages "
                "WHERE substr(created_at, 1, 10) = ? ORDER BY msg_id ASC LIMIT ?",
                (date, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT role, content, tool_events, created_at FROM chat_messages "
                "ORDER BY msg_id ASC LIMIT ?",
                (limit,),
            ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        item = dict(r)
        item["tool_events"] = _json.loads(item["tool_events"]) if item.get("tool_events") else []
        out.append(item)
    return out


def get_recent_history(limit: int = 20) -> list:
    """The last `limit` chat turns (oldest first), across days -- this is what the coach
    receives on every request so it never loses context, even right after midnight or a
    server restart. Stored in `chat_messages` (Turso in production)."""
    conn = _get_conn()
    try:
        _ensure_chat_table(conn)
        rows = conn.execute(
            "SELECT role, content, tool_events, created_at FROM ("
            "  SELECT msg_id, role, content, tool_events, created_at FROM chat_messages "
            "  ORDER BY msg_id DESC LIMIT ?) ORDER BY msg_id ASC",
            (max(1, int(limit)),),
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        item = dict(r)
        item["tool_events"] = _json.loads(item["tool_events"]) if item.get("tool_events") else []
        out.append(item)
    return out


def list_chat_days(days: int = 60) -> list:
    """One entry per day that has a conversation (most recent first), with the
    message count and a short preview of the first thing the user said. Today
    is always included so the "Today" chat page is available even when empty."""
    conn = _get_conn()
    try:
        _ensure_chat_table(conn)
        rows = conn.execute(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM chat_messages "
            "GROUP BY day ORDER BY day DESC LIMIT ?",
            (days,),
        ).fetchall()
        result = []
        for r in rows:
            first = conn.execute(
                "SELECT content FROM chat_messages WHERE substr(created_at, 1, 10) = ? AND role = 'user' "
                "ORDER BY msg_id ASC LIMIT 1",
                (r["day"],),
            ).fetchone()
            preview = (first["content"] if first else "")[:60]
            result.append({"date": r["day"], "messages": r["n"], "preview": preview})
    finally:
        conn.close()
    today = _today()
    if not any(d["date"] == today for d in result):
        result.insert(0, {"date": today, "messages": 0, "preview": ""})
    return result


def clear_chat_history(date: str | None = None) -> dict:
    """Delete one day's conversation (`date`), or everything when omitted."""
    conn = _get_conn()
    try:
        _ensure_chat_table(conn)
        if date:
            conn.execute("DELETE FROM chat_messages WHERE substr(created_at, 1, 10) = ?", (date,))
        else:
            conn.execute("DELETE FROM chat_messages")
        conn.commit()
        return {"status": "cleared"}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()