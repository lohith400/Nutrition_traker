"""
Menu Planner Agent
===================
Given the remaining macro budget for today (from the Math Engine), any
active long-term patterns, and the user's own eating history (from the
Memory Agent), suggests realistic Indian meal options from the real food
database only -- never a food outside food_items.

Guards applied to every suggestion:
  - quality != 'unreliable' (never surface a source row we already know is
    wrong -- see food_quality.py)
  - diet_tag must fit the user's diet (vegan/vegetarian/eggetarian/any)
  - meal_role excludes non-food rows (pickles, sauces, powders...) and,
    when a meal_type is given, prefers foods that actually fit that meal
  - familiarity boost: foods the user has actually logged before (from
    food_preferences, long-term memory) are ranked slightly ahead of foods
    they've never tried, so suggestions feel personalized over time
"""

import sqlite3

try:
    from backend.database import get_db_connection
except ImportError:  # run from inside backend/
    from database import get_db_connection
import os

try:
    from backend import food_quality
except ImportError:
    import food_quality

_DEFAULT_DB = (
    os.path.join(os.path.dirname(__file__), "..", "nutrisync.db")
    if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "nutrisync.db"))
    else os.path.join(os.path.dirname(__file__), "nutrisync.db")
)
DB_PATH = os.getenv("NUTRISYNC_DB_PATH", _DEFAULT_DB)

_MEAL_ROLE_FIT = {
    "breakfast": {"breakfast", "staple", "drink"},
    "lunch": {"main", "staple", "side"},
    "dinner": {"main", "staple", "side"},
    "snack": {"snack", "drink", "side", "breakfast"},
}


def _get_conn():
    conn = get_db_connection(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def suggest_next_meal(remaining_protein_g: float, remaining_calories: float,
                       diet: str = "any", meal_type: str | None = None,
                       exclude_names: set | None = None,
                       randomize: bool = False, count: int = 5) -> dict:
    """
    Rule-based selection over the real database only: if protein is short
    relative to remaining calories, prioritize high-protein-density foods;
    otherwise suggest balanced options. Deliberately rule-based rather than
    LLM-picked, so suggestions are always grounded in verified data.
    """
    import random

    if remaining_calories <= 0:
        return {"status": "over_budget", "message": "Calorie budget for today is used up.", "options": []}

    conn = _get_conn()
    try:
        allowed = food_quality.allowed_diet_tags(diet)
        familiar = {r["food_code"]: r["times_logged"] for r in conn.execute(
            "SELECT food_code, times_logged FROM food_preferences"
        ).fetchall()}

        rows = conn.execute(
            """SELECT food_code, food_name, unit_serving_energy_kcal, unit_serving_protein_g,
                      servings_unit, energy_kcal_100g, protein_g_100g, diet_tag, quality
               FROM food_items
               WHERE quality != 'unreliable'
                 AND COALESCE(unit_serving_energy_kcal, energy_kcal_100g, 0) > 0"""
        ).fetchall()
    finally:
        conn.close()

    candidates = []
    excluded_set = exclude_names or set()
    for r in rows:
        fname = r["food_name"]
        if fname in excluded_set:
            continue
        if (r["diet_tag"] or "vegetarian") not in allowed:
            continue
        role = food_quality.meal_role(fname)
        if role in ("excluded", "dessert"):
            continue
        if meal_type and role not in _MEAL_ROLE_FIT.get(meal_type, {"main", "staple", "snack", "side", "breakfast", "drink"}):
            continue

        has_serving = r["quality"] == "ok" and (r["unit_serving_energy_kcal"] or 0) > 0
        if has_serving:
            kcal, protein, label, qty = r["unit_serving_energy_kcal"], r["unit_serving_protein_g"] or 0, r["servings_unit"], 1
        else:
            kcal, protein, label, qty = r["energy_kcal_100g"], r["protein_g_100g"] or 0, "100g", 100

        if kcal <= 10 or kcal > (remaining_calories * 1.25):
            continue

        density = protein / kcal if kcal else 0
        cal_diff = abs(kcal - (remaining_calories * 0.5)) / max(remaining_calories, 1.0)
        protein_needed_ratio = remaining_protein_g / remaining_calories if remaining_calories > 0 else 0

        if protein_needed_ratio > 0.04:
            strategy = "high_protein_priority"
            score = (density * 70.0) + (familiar.get(r["food_code"], 0) * 2.5) - (cal_diff * 4.0)
        else:
            strategy = "balanced"
            score = (protein * 0.8) + (familiar.get(r["food_code"], 0) * 2.0) - (cal_diff * 4.0)

        candidates.append({
            "food_name": fname,
            "calories": round(kcal, 1),
            "protein_g": round(protein, 1),
            "quantity": qty,
            "unit": "serving" if has_serving else "grams",
            "serving_label": label,
            "score": score,
        })

    if not candidates:
        return {"status": "ok", "strategy": "none", "options": []}

    candidates.sort(key=lambda c: -c["score"])

    if randomize:
        top_pool = candidates[:max(count * 4, 12)]
        picks = random.sample(top_pool, min(count, len(top_pool)))
    else:
        picks = candidates[:count]

    for o in picks:
        o.pop("score", None)

    return {"status": "ok", "strategy": strategy if 'strategy' in locals() else "balanced", "options": picks}


def suggest_day_plan(remaining_calories: float, remaining_protein_g: float,
                      remaining_carbs_g: float, remaining_fat_g: float,
                      diet: str = "any", randomize: bool = True) -> dict:
    """Suggest items per meal slot (breakfast/lunch/snack/dinner) from the
    database only, splitting the remaining budget across the day without repeats."""
    if remaining_calories <= 0:
        return {
            "status": "over_budget",
            "message": "Calorie budget for today is used up.",
            "plan": {"breakfast": [], "lunch": [], "snack": [], "dinner": []},
            "plan_totals": {"calories": 0.0, "protein_g": 0.0},
            "budget": {
                "calories": remaining_calories, "protein_g": remaining_protein_g,
                "carbs_g": remaining_carbs_g, "fat_g": remaining_fat_g,
            },
        }

    splits = {"breakfast": 0.25, "lunch": 0.35, "snack": 0.15, "dinner": 0.25}
    plan = {}
    total = {"calories": 0.0, "protein_g": 0.0}
    used_names = set()

    for meal, share in splits.items():
        slot_kcal = remaining_calories * share
        slot_prot = remaining_protein_g * share
        result = suggest_next_meal(slot_prot, slot_kcal, diet, meal, exclude_names=used_names, randomize=randomize, count=2)
        picks = result.get("options", [])
        for p in picks:
            used_names.add(p["food_name"])
            total["calories"] += p["calories"]
            total["protein_g"] += p["protein_g"]
        plan[meal] = picks

    return {
        "status": "ok",
        "plan": plan,
        "plan_totals": {"calories": round(total["calories"], 1), "protein_g": round(total["protein_g"], 1)},
        "budget": {
            "calories": remaining_calories, "protein_g": remaining_protein_g,
            "carbs_g": remaining_carbs_g, "fat_g": remaining_fat_g,
        },
    }