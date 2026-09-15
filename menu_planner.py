"""
Menu Planner Agent
===================
Given the remaining macro budget for today (from the Math Engine) and any
active long-term patterns (from the Memory Agent), suggests realistic
Indian meal options from the real food database that specifically correct
whatever's short -- not generic advice.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "nutrisync.db")


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def suggest_next_meal(remaining_protein_g: float, remaining_calories: float) -> dict:
    """
    Simple, explainable rule-based selection over the real database:
    if protein is short relative to remaining calories, prioritize
    high-protein-density foods; otherwise suggest balanced options.
    This is deliberately rule-based rather than an LLM picking foods --
    keeps recommendations grounded in the same verified data as everything
    else, with the LLM only used to phrase the suggestion nicely.
    """
    conn = _get_conn()

    if remaining_calories <= 0:
        conn.close()
        return {"status": "over_budget", "message": "Calorie budget for today is used up."}

    # protein density = protein per 100 kcal, a common way to rank
    # "efficient" protein sources within a limited calorie budget
    protein_needed_ratio = remaining_protein_g / remaining_calories if remaining_calories > 0 else 0

    if protein_needed_ratio > 0.05:  # roughly: needs a high-protein option
        rows = conn.execute(
            """SELECT food_name, unit_serving_energy_kcal, unit_serving_protein_g, servings_unit
               FROM food_items
               WHERE unit_serving_protein_g > 0 AND unit_serving_energy_kcal > 0
                 AND unit_serving_energy_kcal <= ?
               ORDER BY (unit_serving_protein_g * 1.0 / unit_serving_energy_kcal) DESC
               LIMIT 5""",
            (remaining_calories,),
        ).fetchall()
        strategy = "high_protein_priority"
    else:
        rows = conn.execute(
            """SELECT food_name, unit_serving_energy_kcal, unit_serving_protein_g, servings_unit
               FROM food_items
               WHERE unit_serving_energy_kcal > 0 AND unit_serving_energy_kcal <= ?
               ORDER BY unit_serving_protein_g DESC
               LIMIT 5""",
            (remaining_calories,),
        ).fetchall()
        strategy = "balanced"

    conn.close()
    return {
        "status": "ok",
        "strategy": strategy,
        "options": [dict(r) for r in rows],
    }
