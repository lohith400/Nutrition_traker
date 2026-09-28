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

import sqlite3
import os
from datetime import datetime, timedelta

_DEFAULT_DB = (
    os.path.join(os.path.dirname(__file__), "..", "nutrisync.db")
    if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "nutrisync.db"))
    else os.path.join(os.path.dirname(__file__), "nutrisync.db")
)
DB_PATH = os.getenv("NUTRISYNC_DB_PATH", _DEFAULT_DB)


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- User profile ----------

def save_user_profile(profile: dict) -> dict:
    """
    Called once during onboarding (and again if the user updates their
    profile). profile must include the raw answers AND the calculated
    targets (from math_engine.calculate_bmr_tdee / calculate_targets).
    """
    conn = _get_conn()
    profile = {**profile, "diet": profile.get("diet") or "any"}
    conn.execute(
        """INSERT OR REPLACE INTO user_profile
           (id, name, age, sex, height_cm, current_weight_kg, target_weight_kg,
            goal, activity_level, allergies, medical_conditions, sleep_schedule,
            diet, bmr_kcal, tdee_kcal, target_calories, target_protein_g,
            target_carbs_g, target_fat_g, target_water_l, onboarded_at)
           VALUES (1, :name, :age, :sex, :height_cm, :current_weight_kg, :target_weight_kg,
                   :goal, :activity_level, :allergies, :medical_conditions, :sleep_schedule,
                   :diet, :bmr_kcal, :tdee_kcal, :target_calories, :target_protein_g,
                   :target_carbs_g, :target_fat_g, :target_water_l, :onboarded_at)""",
        profile,
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


def get_user_profile() -> dict:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    conn.close()
    if row is None:
        return {"status": "not_onboarded"}
    return dict(row)


def get_user_diet() -> str:
    """Convenience accessor used by rag_resolver / menu_planner callers."""
    profile = get_user_profile()
    return profile.get("diet") or "any"


# ---------- Daily logs (short-term memory) ----------

def log_meal(meal_type: str, food_code: str, food_name: str, quantity: float,
             calories: float, protein_g: float, carbs_g: float, fat_g: float,
             unit: str = "serving", serving_label: str | None = None) -> dict:
    """
    Saves one logged food item immediately, and updates the long-term
    food_preferences row for this food so the system learns what the user
    actually eats (used by the menu planner's familiarity ranking and by
    detect_patterns).
    """
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    conn = _get_conn()
    conn.execute(
        """INSERT INTO daily_logs
           (log_date, log_time, meal_type, food_code, food_name, quantity,
            calories, protein_g, carbs_g, fat_g, unit, serving_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (date_str, now.strftime("%Y-%m-%d %H:%M:%S"), meal_type,
         food_code, food_name, quantity, calories, protein_g, carbs_g, fat_g,
         unit, serving_label),
    )
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
    conn.close()
    return {"status": "logged", "date": date_str}


def get_todays_logs() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    rows = conn.execute(
        "SELECT meal_type, food_name, quantity, unit, serving_label, calories, protein_g, carbs_g, fat_g "
        "FROM daily_logs WHERE log_date = ? ORDER BY log_time", (today,),
    ).fetchall()
    conn.close()
    return {"date": today, "meals": [dict(r) for r in rows]}


def get_logs_history(days: int = 14) -> list:
    """Every logged meal for the last `days` days, grouped by date (most
    recent first), each with that day's totals."""
    since = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    conn = _get_conn()
    rows = conn.execute(
        "SELECT log_date, log_time, meal_type, food_name, quantity, unit, serving_label, "
        "calories, protein_g, carbs_g, fat_g FROM daily_logs WHERE log_date >= ? "
        "ORDER BY log_date DESC, log_time ASC",
        (since,),
    ).fetchall()
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


# ---------- Water tracking ----------

def _ensure_water_table(conn) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS water_logs (
               log_id   INTEGER PRIMARY KEY AUTOINCREMENT,
               log_date TEXT NOT NULL,
               log_time TEXT NOT NULL,
               amount_l REAL NOT NULL
           )"""
    )


def log_water(amount_l: float) -> dict:
    now = datetime.now()
    conn = _get_conn()
    _ensure_water_table(conn)
    conn.execute(
        "INSERT INTO water_logs (log_date, log_time, amount_l) VALUES (?, ?, ?)",
        (now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S"), amount_l),
    )
    conn.commit()
    conn.close()
    return {"status": "logged"}


def get_todays_water() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    _ensure_water_table(conn)
    row = conn.execute(
        "SELECT COALESCE(SUM(amount_l),0) as total FROM water_logs WHERE log_date = ?", (today,)
    ).fetchone()
    conn.close()
    return {"date": today, "consumed_water_l": round(row["total"], 2)}


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
    conn = _get_conn()
    profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    if profile is None:
        conn.close()
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

    conn.commit()
    conn.close()
    return {"status": "checked", "new_patterns": new_patterns}


def get_active_patterns() -> dict:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT pattern_type, description, detected_on FROM detected_patterns "
        "WHERE still_active = 1 ORDER BY detected_on DESC LIMIT 5"
    ).fetchall()
    conn.close()
    return {"patterns": [dict(r) for r in rows]}


# ---------- Long-term memory: food preferences ----------

def get_food_preferences(limit: int = 10) -> dict:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT food_code, food_name, times_logged, first_eaten, last_eaten, "
        "breakfast_count, lunch_count, dinner_count, snack_count "
        "FROM food_preferences ORDER BY times_logged DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return {"foods": [dict(r) for r in rows]}


# ---------- Long-term memory: explicit user facts ----------

def set_user_fact(key: str, value: str) -> dict:
    conn = _get_conn()
    conn.execute(
        """INSERT INTO user_facts (fact_key, fact_value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(fact_key) DO UPDATE SET fact_value = excluded.fact_value, updated_at = excluded.updated_at""",
        (key, value, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


def get_user_facts() -> dict:
    conn = _get_conn()
    rows = conn.execute("SELECT fact_key, fact_value, updated_at FROM user_facts").fetchall()
    conn.close()
    return {r["fact_key"]: r["fact_value"] for r in rows}


# ---------- Coach chat history ----------
# The conversational coach (see orchestrator.chat_with_tools) needs its
# transcript to survive page refreshes and server restarts, so it lives in
# the same SQLite database as everything else rather than in memory.

def _ensure_chat_table(conn) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS chat_messages (
               msg_id     INTEGER PRIMARY KEY AUTOINCREMENT,
               role       TEXT NOT NULL,
               content    TEXT NOT NULL,
               tool_events TEXT,
               created_at TEXT NOT NULL
           )"""
    )


def save_chat_message(role: str, content: str, tool_events=None) -> dict:
    import json as _json
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _get_conn()
    _ensure_chat_table(conn)
    conn.execute(
        "INSERT INTO chat_messages (role, content, tool_events, created_at) VALUES (?, ?, ?, ?)",
        (role, content, _json.dumps(tool_events) if tool_events else None, now),
    )
    conn.commit()
    conn.close()
    return {"status": "saved"}


def get_chat_history(limit: int = 200) -> list:
    import json as _json
    conn = _get_conn()
    _ensure_chat_table(conn)
    rows = conn.execute(
        "SELECT role, content, tool_events, created_at FROM chat_messages "
        "ORDER BY msg_id ASC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        item = dict(r)
        item["tool_events"] = _json.loads(item["tool_events"]) if item.get("tool_events") else []
        out.append(item)
    return out


def clear_chat_history() -> dict:
    conn = _get_conn()
    _ensure_chat_table(conn)
    conn.execute("DELETE FROM chat_messages")
    conn.commit()
    conn.close()
    return {"status": "cleared"}