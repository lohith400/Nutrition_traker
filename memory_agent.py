"""
Memory Agent
=============
Owns the database. Two jobs:
  1. Short-term memory: log today's meals, read today's totals.
  2. Long-term memory: look across multiple days and detect patterns
     (e.g. "low breakfast protein, 3 days running").

This agent does NOT do arithmetic itself for meal totals (that's the
Math Engine's job) -- it only stores what the Math Engine already
calculated, and reasons about trends across stored history.
"""

import sqlite3
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "nutrisync.db")


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------- User profile ----------

def save_user_profile(profile: dict) -> dict:
    """
    Called once during onboarding. profile must include the raw answers
    AND the calculated targets (from math_engine.calculate_bmr_tdee /
    calculate_targets) -- this function just persists them.
    """
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO user_profile
           (id, name, age, sex, height_cm, current_weight_kg, target_weight_kg,
            goal, activity_level, allergies, medical_conditions, sleep_schedule,
            bmr_kcal, tdee_kcal, target_calories, target_protein_g,
            target_carbs_g, target_fat_g, target_water_l, onboarded_at)
           VALUES (1, :name, :age, :sex, :height_cm, :current_weight_kg, :target_weight_kg,
                   :goal, :activity_level, :allergies, :medical_conditions, :sleep_schedule,
                   :bmr_kcal, :tdee_kcal, :target_calories, :target_protein_g,
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


# ---------- Daily logs (short-term memory) ----------

def log_meal(meal_type: str, food_code: str, food_name: str, quantity: float,
             calories: float, protein_g: float, carbs_g: float, fat_g: float) -> dict:
    """
    Saves one logged food item immediately. This is the "environment
    update" step -- the moment this runs, the database reflects reality,
    and the next get_remaining_budget_today call will see it.
    """
    now = datetime.now()
    conn = _get_conn()
    conn.execute(
        """INSERT INTO daily_logs
           (log_date, log_time, meal_type, food_code, food_name, quantity,
            calories, protein_g, carbs_g, fat_g)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d %H:%M:%S"), meal_type,
         food_code, food_name, quantity, calories, protein_g, carbs_g, fat_g),
    )
    conn.commit()
    conn.close()
    return {"status": "logged", "date": now.strftime("%Y-%m-%d")}


def get_todays_logs() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    conn = _get_conn()
    rows = conn.execute(
        "SELECT meal_type, food_name, quantity, calories, protein_g, carbs_g, fat_g "
        "FROM daily_logs WHERE log_date = ? ORDER BY log_time", (today,),
    ).fetchall()
    conn.close()
    return {"date": today, "meals": [dict(r) for r in rows]}


# ---------- Long-term memory: pattern detection ----------

def detect_patterns() -> dict:
    """
    Looks across the last 7 days of logs and checks for recurring issues.
    
    This is what turns the system from "a calculator that forgets
    everything" into something that sounds like it actually knows the
    user's habits. Called periodically (e.g. once per day) by the
    Orchestrator, not on every single message.
    """
    conn = _get_conn()
    profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    if profile is None:
        conn.close()
        return {"status": "not_onboarded"}

    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    # Check: is breakfast protein consistently low?
    breakfast_protein = conn.execute(
        """SELECT log_date, COALESCE(SUM(protein_g),0) as protein
           FROM daily_logs
           WHERE meal_type = 'breakfast' AND log_date >= ?
           GROUP BY log_date ORDER BY log_date DESC""",
        (seven_days_ago,),
    ).fetchall()

    low_protein_days = [r["log_date"] for r in breakfast_protein if r["protein"] < 10]
    new_patterns = []

    if len(low_protein_days) >= 3:
        desc = f"Breakfast protein has been under 10g on {len(low_protein_days)} of the last 7 days."
        conn.execute(
            "INSERT INTO detected_patterns (detected_on, pattern_type, description) VALUES (?, ?, ?)",
            (datetime.now().strftime("%Y-%m-%d"), "low_protein_breakfast", desc),
        )
        new_patterns.append(desc)

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
