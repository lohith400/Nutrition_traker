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
    "breakfast": {"breakfast", "staple", "main", "drink"},
    "lunch": {"main", "staple", "side"},
    "dinner": {"main", "staple", "side"},
    "snack": {"snack", "breakfast", "drink", "side"},
}


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def suggest_next_meal(remaining_protein_g: float, remaining_calories: float,
                       diet: str = "any", meal_type: str | None = None) -> dict:
    """
    Rule-based selection over the real database only: if protein is short
    relative to remaining calories, prioritize high-protein-density foods;
    otherwise suggest balanced options. Deliberately rule-based rather than
    LLM-picked, so suggestions are always grounded in verified data.
    """
    conn = _get_conn()

    if remaining_calories <= 0:
        conn.close()
        return {"status": "over_budget", "message": "Calorie budget for today is used up."}

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
    conn.close()

    candidates = []
    for r in rows:
        if (r["diet_tag"] or "vegetarian") not in allowed:
            continue
        role = food_quality.meal_role(r["food_name"])
        if role in ("excluded", "dessert"):
            continue
        if meal_type and role not in _MEAL_ROLE_FIT.get(meal_type, {"main", "staple", "snack", "side", "breakfast", "drink"}):
            continue

        has_serving = r["quality"] == "ok" and (r["unit_serving_energy_kcal"] or 0) > 0
        if has_serving:
            kcal, protein, label, qty = r["unit_serving_energy_kcal"], r["unit_serving_protein_g"] or 0, r["servings_unit"], 1
        else:
            kcal, protein, label, qty = r["energy_kcal_100g"], r["protein_g_100g"] or 0, "100g", 100
        if kcal <= 0 or kcal > remaining_calories:
            continue

        candidates.append({
            "food_name": r["food_name"],
            "calories": round(kcal, 1),
            "protein_g": round(protein, 1),
            "quantity": qty,
            "unit": "serving" if has_serving else "grams",
            "serving_label": label,
            "protein_density": protein / kcal if kcal else 0,
            "familiarity": familiar.get(r["food_code"], 0),
        })

    protein_needed_ratio = remaining_protein_g / remaining_calories if remaining_calories > 0 else 0
    if protein_needed_ratio > 0.05:
        strategy = "high_protein_priority"
        candidates.sort(key=lambda c: (-c["protein_density"], -min(c["familiarity"], 5)))
    else:
        strategy = "balanced"
        candidates.sort(key=lambda c: (-c["protein_g"], -min(c["familiarity"], 5)))

    options = candidates[:5]
    for o in options:
        o.pop("protein_density", None)
        o.pop("familiarity", None)

    return {"status": "ok", "strategy": strategy, "options": options}


def suggest_day_plan(remaining_calories: float, remaining_protein_g: float,
                      remaining_carbs_g: float, remaining_fat_g: float,
                      diet: str = "any") -> dict:
    """Suggest one item per meal slot (breakfast/lunch/snack/dinner) from the
    database only, roughly splitting the remaining budget across the day."""
    splits = {"breakfast": 0.25, "lunch": 0.35, "snack": 0.15, "dinner": 0.25}
    plan = {}
    total = {"calories": 0.0, "protein_g": 0.0}
    for meal, share in splits.items():
        result = suggest_next_meal(remaining_protein_g * share * 2, remaining_calories * share, diet, meal)
        picks = result.get("options", [])[:2]
        plan[meal] = picks
        for p in picks:
            total["calories"] += p["calories"]
            total["protein_g"] += p["protein_g"]
    return {
        "status": "ok",
        "plan": plan,
        "plan_totals": {"calories": round(total["calories"], 1), "protein_g": round(total["protein_g"], 1)},
        "budget": {
            "calories": remaining_calories, "protein_g": remaining_protein_g,
            "carbs_g": remaining_carbs_g, "fat_g": remaining_fat_g,
        },
    }