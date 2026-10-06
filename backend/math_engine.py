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


# ---------------------------------------------------------------------------
# ICMR-NIN 2020 Recommended Dietary Allowances (RDA) for Indian Adults
# Source: "Nutrient Requirements for Indians: Recommended Dietary Allowances (RDA)
# and Estimated Average Requirements (EAR) - 2020", National Institute of Nutrition
# (ICMR-NIN), Hyderabad. Reference body weights: 65 kg (men), 55 kg (women).
# ---------------------------------------------------------------------------
ICMR_NIN_2020_RDA = {
    "male": {
        "fibre_g": 35.0,        # 30-40g based on 2000-2400 kcal requirement
        "calcium_mg": 1000.0,
        "magnesium_mg": 440.0,
        "sodium_mg": 2000.0,     # Safe intake / daily upper intake guidance
        "potassium_mg": 3500.0,
        "iron_mg": 19.0,
        "copper_mg": 1.7,
        "zinc_mg": 17.0,
        "vita_ug": 1000.0,       # Retinol activity equivalents (RAE)
        "vite_mg": 10.0,         # alpha-tocopherol
        "vitd_ug": 15.0,         # 600 IU
        "vitk_ug": 55.0,
        "folate_ug": 300.0,
        "vitb1_mg": 1.8,         # Thiamine
        "vitb2_mg": 2.5,         # Riboflavin
        "vitb3_mg": 18.0,        # Niacin
        "vitb5_mg": 5.0,         # Pantothenic acid (AI / standard reference)
        "vitb6_mg": 2.4,         # Pyridoxine
        "vitb7_ug": 30.0,        # Biotin (AI)
        "vitc_mg": 80.0,
    },
    "female": {
        "fibre_g": 30.0,
        "calcium_mg": 1000.0,
        "magnesium_mg": 370.0,
        "sodium_mg": 2000.0,
        "potassium_mg": 3500.0,
        "iron_mg": 29.0,
        "copper_mg": 1.7,
        "zinc_mg": 13.2,
        "vita_ug": 840.0,
        "vite_mg": 7.5,
        "vitd_ug": 15.0,
        "vitk_ug": 55.0,
        "folate_ug": 220.0,
        "vitb1_mg": 1.4,
        "vitb2_mg": 1.9,
        "vitb3_mg": 14.0,
        "vitb5_mg": 5.0,
        "vitb6_mg": 1.9,
        "vitb7_ug": 30.0,
        "vitc_mg": 65.0,
    },
}


def _extract_micros(row, scale: float, prefix: str = "unit_serving_") -> dict:
    """Extract and scale micronutrient dictionary from a database row."""
    keys = row.keys() if hasattr(row, "keys") else []

    def get_val(col_name):
        if col_name in keys and row[col_name] is not None:
            try:
                return float(row[col_name])
            except (ValueError, TypeError):
                return None
        return None

    def calc(col_name):
        v = get_val(col_name)
        return round(v * scale, 2) if v is not None else None

    # Vit D sum
    d2 = get_val(f"{prefix}vitd2_ug" if prefix else "vitd2_ug_100g")
    d3 = get_val(f"{prefix}vitd3_ug" if prefix else "vitd3_ug_100g")
    vitd = round(((d2 or 0) + (d3 or 0)) * scale, 2) if (d2 is not None or d3 is not None) else None

    # Vit K sum
    k1 = get_val(f"{prefix}vitk1_ug" if prefix else "vitk1_ug_100g")
    k2 = get_val(f"{prefix}vitk2_ug" if prefix else "vitk2_ug_100g")
    vitk = round(((k1 or 0) + (k2 or 0)) * scale, 2) if (k1 is not None or k2 is not None) else None

    # Folate fallback (folate_ug or vitb9_ug)
    fol = get_val(f"{prefix}folate_ug" if prefix else "folate_ug_100g")
    if fol is None:
        fol = get_val(f"{prefix}vitb9_ug" if prefix else "vitb9_ug_100g")
    folate = round(fol * scale, 2) if fol is not None else None

    micros = {
        "calcium_mg": calc(f"{prefix}calcium_mg" if prefix else "calcium_mg_100g"),
        "magnesium_mg": calc(f"{prefix}magnesium_mg" if prefix else "magnesium_mg_100g"),
        "sodium_mg": calc(f"{prefix}sodium_mg" if prefix else "sodium_mg_100g"),
        "potassium_mg": calc(f"{prefix}potassium_mg" if prefix else "potassium_mg_100g"),
        "iron_mg": calc(f"{prefix}iron_mg" if prefix else "iron_mg_100g"),
        "copper_mg": calc(f"{prefix}copper_mg" if prefix else "copper_mg_100g"),
        "zinc_mg": calc(f"{prefix}zinc_mg" if prefix else "zinc_mg_100g"),
        "vita_ug": calc(f"{prefix}vita_ug" if prefix else "vita_ug_100g"),
        "vite_mg": calc(f"{prefix}vite_mg" if prefix else "vite_mg_100g"),
        "vitd_ug": vitd,
        "vitk_ug": vitk,
        "folate_ug": folate,
        "vitb1_mg": calc(f"{prefix}vitb1_mg" if prefix else "vitb1_mg_100g"),
        "vitb2_mg": calc(f"{prefix}vitb2_mg" if prefix else "vitb2_mg_100g"),
        "vitb3_mg": calc(f"{prefix}vitb3_mg" if prefix else "vitb3_mg_100g"),
        "vitb5_mg": calc(f"{prefix}vitb5_mg" if prefix else "vitb5_mg_100g"),
        "vitb6_mg": calc(f"{prefix}vitb6_mg" if prefix else "vitb6_mg_100g"),
        "vitb7_ug": calc(f"{prefix}vitb7_ug" if prefix else "vitb7_ug_100g"),
        "vitc_mg": calc(f"{prefix}vitc_mg" if prefix else "vitc_mg_100g"),
    }
    return micros


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

    # The user's own custom foods and the built-in reference staples are not rows of food_items.
    if str(food_code).startswith(("custom:", "ref:")):
        try:
            from backend import custom_foods
        except ImportError:
            import custom_foods
        res = custom_foods.macros_for(str(food_code), quantity, unit)
        if isinstance(res, dict) and "error" not in res:
            res["fibre_g"] = None
            res["micros"] = None
        return res

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
        keys = row.keys() if hasattr(row, "keys") else []
        serv_fib = row["unit_serving_fibre_g"] if "unit_serving_fibre_g" in keys else None
        fibre_val = round(serv_fib * quantity, 1) if serv_fib is not None else None
        micros_val = _extract_micros(row, quantity, prefix="unit_serving_")
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
            "fibre_g": fibre_val,
            "micros": micros_val,
        }
    else:  # grams
        if not (row["energy_kcal_100g"] or 0):
            return {"error": f"No per-100g nutrition data for '{row['food_name']}'.", "food_name": row["food_name"]}
        factor = quantity / 100.0
        keys = row.keys() if hasattr(row, "keys") else []
        fib_100 = row["fibre_g_100g"] if "fibre_g_100g" in keys else None
        fibre_val = round(fib_100 * factor, 1) if fib_100 is not None else None
        micros_val = _extract_micros(row, factor, prefix="")
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
            "fibre_g": fibre_val,
            "micros": micros_val,
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