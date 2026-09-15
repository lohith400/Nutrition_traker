"""
Deterministic Math Engine
==========================
Plain Python. NOT an LLM. This is deliberate: LLMs are unreliable at
arithmetic, so every calorie/macro number the user sees must be computed
here, not guessed by a model. The LLM-based agents only ever consume the
numbers this file produces -- they never compute them.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "nutrisync.db")


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def calculate_bmr_tdee(age, sex, height_cm, weight_kg, activity_level):
    """
    Mifflin-St Jeor equation (standard, widely used BMR formula).
    activity_level multipliers are the standard TDEE scaling factors.
    """
    if sex.lower() in ("male", "m"):
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    multipliers = {
        "sedentary": 1.2,
        "casual": 1.375,
        "gym": 1.55,
        "bodybuilder": 1.725,
    }
    multiplier = multipliers.get(activity_level.lower(), 1.375)
    tdee = bmr * multiplier
    return round(bmr, 1), round(tdee, 1)


def calculate_targets(tdee, goal, weight_kg):
    """
    Standard evidence-based macro-split rules of thumb:
      fat_loss:    ~20% calorie deficit, protein 2.0 g/kg (protect muscle)
      muscle_gain: ~15% calorie surplus, protein 1.8 g/kg
      recomp:      TDEE as-is, protein 2.2 g/kg (high protein, no big swing)
      maintenance: TDEE as-is, protein 1.6 g/kg
    Fat is set to 25% of calories, remainder goes to carbs.
    """
    goal = goal.lower()
    if goal == "fat_loss":
        calories = tdee * 0.80
        protein_g = 2.0 * weight_kg
    elif goal == "muscle_gain":
        calories = tdee * 1.15
        protein_g = 1.8 * weight_kg
    elif goal == "recomp":
        calories = tdee
        protein_g = 2.2 * weight_kg
    else:  # maintenance
        calories = tdee
        protein_g = 1.6 * weight_kg

    fat_g = (calories * 0.25) / 9        # 9 kcal per gram of fat
    protein_kcal = protein_g * 4          # 4 kcal per gram of protein
    fat_kcal = fat_g * 9
    carbs_kcal = calories - protein_kcal - fat_kcal
    carbs_g = max(carbs_kcal / 4, 0)      # 4 kcal per gram of carbs

    water_l = round(weight_kg * 0.035, 1)  # ~35ml per kg bodyweight, common guideline

    return {
        "target_calories": round(calories),
        "target_protein_g": round(protein_g, 1),
        "target_carbs_g": round(carbs_g, 1),
        "target_fat_g": round(fat_g, 1),
        "target_water_l": water_l,
    }


def calculate_meal_macros(food_code: str, quantity: float) -> dict:
    """
    Given a resolved food_code (from the RAG agent) and a quantity in
    SERVINGS (e.g. 2 idlis = quantity 2), returns exact macros using the
    real per-serving data from food_items. This is a straight lookup +
    multiplication -- no ambiguity, no model involved.

    Includes a data-sanity check: the Anuvaad source data has a small
    number of rows with implausible values (e.g. fat content denser than
    pure oil), likely data-entry errors upstream. Rather than silently
    presenting a wrong number as fact, flagged rows return a warning so
    the Orchestrator can ask the user to double check instead of trusting it.
    """
    conn = _get_conn()
    row = conn.execute("SELECT * FROM food_items WHERE food_code = ?", (food_code,)).fetchone()
    conn.close()

    if row is None:
        return {"error": f"Unknown food_code: {food_code}"}

    result = {
        "food_code": food_code,
        "food_name": row["food_name"],
        "quantity": quantity,
        "unit": row["servings_unit"],
        "calories": round((row["unit_serving_energy_kcal"] or 0) * quantity, 1),
        "protein_g": round((row["unit_serving_protein_g"] or 0) * quantity, 1),
        "carbs_g": round((row["unit_serving_carb_g"] or 0) * quantity, 1),
        "fat_g": round((row["unit_serving_fat_g"] or 0) * quantity, 1),
    }

    # Sanity check: pure fat/oil is ~100g fat per 100g. Anything at or
    # above that in the source's per-100g column is almost certainly a
    # data error, not a real food.
    if (row["fat_g_100g"] or 0) >= 50:
        result["data_quality_warning"] = (
            f"Source data for '{row['food_name']}' looks off (unusually high fat value). "
            "Treat this number with caution and consider asking the user to confirm or "
            "log a similar, better-behaved item instead."
        )

    return result


def get_remaining_budget_today(log_date: str) -> dict:
    """
    Sums every meal logged today against the user's daily targets.
    Pure SQL aggregation + subtraction -- again, no model touches this.
    """
    conn = _get_conn()
    profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    if profile is None:
        conn.close()
        return {"error": "User not onboarded yet."}

    totals = conn.execute(
        """SELECT COALESCE(SUM(calories),0) as cal, COALESCE(SUM(protein_g),0) as pro,
                  COALESCE(SUM(carbs_g),0) as carb, COALESCE(SUM(fat_g),0) as fat
           FROM daily_logs WHERE log_date = ?""",
        (log_date,),
    ).fetchone()
    conn.close()

    return {
        "date": log_date,
        "consumed_calories": totals["cal"],
        "consumed_protein_g": totals["pro"],
        "consumed_carbs_g": totals["carb"],
        "consumed_fat_g": totals["fat"],
        "remaining_calories": round(profile["target_calories"] - totals["cal"], 1),
        "remaining_protein_g": round(profile["target_protein_g"] - totals["pro"], 1),
        "remaining_carbs_g": round(profile["target_carbs_g"] - totals["carb"], 1),
        "remaining_fat_g": round(profile["target_fat_g"] - totals["fat"], 1),
        "target_calories": profile["target_calories"],
        "target_protein_g": profile["target_protein_g"],
        "target_carbs_g": profile["target_carbs_g"],
        "target_fat_g": profile["target_fat_g"],
    }
