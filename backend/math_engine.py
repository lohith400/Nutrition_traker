"""
Deterministic Math Engine
==========================
Plain Python. NOT an LLM. This is deliberate: LLMs are unreliable at
arithmetic, so every calorie/macro number the user sees must be computed
here, not guessed by a model. The LLM-based agents only ever consume the
numbers this file produces -- they never compute them.

Unit handling (this used to be the source of the "20,000 calorie" bug):
food_items stores BOTH a per-100g row and a per-standard-serving row. The
old code always multiplied the per-serving numbers by `quantity`, so typing
"100" meaning "100 grams" actually meant "100 servings" and blew up to
huge, nonsensical totals. Now every call is explicit about which unit the
quantity is in:

  unit="serving"  -> quantity is a number of standard servings (e.g. 2 idlis)
                      uses unit_serving_* columns
  unit="grams"    -> quantity is a weight in grams (e.g. 150g paneer)
                      uses *_100g columns, scaled by quantity/100

If the food has no usable serving in the source data (quality='grams_only'
or 'unreliable'), only unit="grams" is accepted -- callers should always
check food_items.quality / serving info (via rag_resolver) first and ask
the user for grams when there's no serving to offer.
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

MAX_SERVINGS = 20     # sanity ceiling: nobody logs 100 servings of one dish
MAX_GRAMS = 2000       # sanity ceiling: 2kg of a single food in one entry


def _get_conn():
    conn = get_db_connection(DB_PATH)
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


def calculate_meal_macros(food_code: str, quantity: float, unit: str = "serving") -> dict:
    """
    Given a resolved food_code and a quantity, returns exact macros.
    Straight lookup + multiplication -- no ambiguity, no model involved.

    unit="serving": quantity is servings, uses unit_serving_* columns.
                    Rejected if the food has no usable serving data
                    (quality != 'ok') -- caller should fall back to grams.
    unit="grams":   quantity is a weight in grams, uses *_100g columns
                    scaled by quantity/100. Always available for any food
                    with an energy value, regardless of quality grade.

    Every result carries `quality` / `quality_note` so a shaky source row
    is flagged, never silently presented as fact.
    """
    if unit not in ("serving", "grams"):
        return {"error": f"Invalid unit '{unit}', must be 'serving' or 'grams'."}
    if quantity is None or quantity <= 0:
        return {"error": "Quantity must be a positive number."}
    if unit == "serving" and quantity > MAX_SERVINGS:
        return {"error": f"{quantity} servings looks too large for one log entry (max {MAX_SERVINGS}). Did you mean grams?"}
    if unit == "grams" and quantity > MAX_GRAMS:
        return {"error": f"{quantity}g looks too large for one log entry (max {MAX_GRAMS}g)."}

    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM food_items WHERE food_code = ?", (food_code,)).fetchone()
    finally:
        conn.close()

    if row is None:
        return {"error": f"Unknown food_code: {food_code}"}

    quality = row["quality"] or "unreliable"

    if unit == "serving":
        if quality != "ok" or not row["servings_unit"] or not (row["unit_serving_energy_kcal"] or 0):
            return {
                "error": (
                    f"'{row['food_name']}' doesn't have a reliable standard-serving size in the "
                    "database. Please log it by weight in grams instead."
                ),
                "food_name": row["food_name"],
                "quality": quality,
                "fallback_unit": "grams",
            }
        result = {
            "food_code": food_code,
            "food_name": row["food_name"],
            "quantity": quantity,
            "unit": "serving",
            "serving_label": row["servings_unit"],
            "calories": round((row["unit_serving_energy_kcal"] or 0) * quantity, 1),
            "protein_g": round((row["unit_serving_protein_g"] or 0) * quantity, 1),
            "carbs_g": round((row["unit_serving_carb_g"] or 0) * quantity, 1),
            "fat_g": round((row["unit_serving_fat_g"] or 0) * quantity, 1),
        }
    else:  # grams
        if not (row["energy_kcal_100g"] or 0):
            return {"error": f"No per-100g nutrition data for '{row['food_name']}'.", "food_name": row["food_name"]}
        factor = quantity / 100.0
        result = {
            "food_code": food_code,
            "food_name": row["food_name"],
            "quantity": quantity,
            "unit": "grams",
            "serving_label": f"{quantity:g}g",
            "calories": round((row["energy_kcal_100g"] or 0) * factor, 1),
            "protein_g": round((row["protein_g_100g"] or 0) * factor, 1),
            "carbs_g": round((row["carb_g_100g"] or 0) * factor, 1),
            "fat_g": round((row["fat_g_100g"] or 0) * factor, 1),
        }

    result["quality"] = quality
    if row["quality_note"]:
        result["data_quality_warning"] = (
            f"Source data for '{row['food_name']}' looks unreliable ({row['quality_note']}). "
            "Treat this number with caution and consider confirming or logging a similar, "
            "better-behaved item instead."
        )
    return result


def get_remaining_budget_today(log_date: str) -> dict:
    """
    Sums every meal logged today against the user's daily targets.
    Pure SQL aggregation + subtraction -- again, no model touches this.
    """
    conn = _get_conn()
    try:
        profile = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        if profile is None:
            return {"error": "User not onboarded yet."}

        totals = conn.execute(
            """SELECT COALESCE(SUM(calories),0) as cal, COALESCE(SUM(protein_g),0) as pro,
                      COALESCE(SUM(carbs_g),0) as carb, COALESCE(SUM(fat_g),0) as fat
               FROM daily_logs WHERE log_date = ?""",
            (log_date,),
        ).fetchone()
    finally:
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
        "target_water_l": profile["target_water_l"],
    }