"""Unit tests for the Deterministic Math Engine (backend/math_engine.py).

Tests BMR (Mifflin-St Jeor), TDEE, macro target calculations, Atwater equivalence,
ICMR-NIN RDA tables, meal macro calculations, and input boundary validations.
"""
import sqlite3
import pytest

from backend.math_engine import (
    ICMR_NIN_2020_RDA,
    MAX_GRAMS,
    MAX_SERVINGS,
    calculate_bmr_tdee,
    calculate_meal_macros,
    calculate_targets,
    get_remaining_budget_today,
)


# ---------------------------------------------------------------------------
# BMR & TDEE Calculations (Mifflin-St Jeor)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "age, sex, height_cm, weight_kg, expected_bmr",
    [
        # Hand calculation Male: 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 -> 1648.8
        (30, "male", 175.0, 70.0, 1648.8),
        (30, "Male", 175.0, 70.0, 1648.8),
        (30, "m", 175.0, 70.0, 1648.8),
        (30, "M", 175.0, 70.0, 1648.8),
        # Hand calculation Female: 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 -> 1320.2
        (30, "female", 165.0, 60.0, 1320.2),
        (30, "Female", 165.0, 60.0, 1320.2),
        (30, "f", 165.0, 60.0, 1320.2),
        # Older male: 50y, 180cm, 85kg -> 10*85 + 6.25*180 - 5*50 + 5 = 850 + 1125 - 250 + 5 = 1730.0
        (50, "male", 180.0, 85.0, 1730.0),
        # Young female: 20y, 150cm, 45kg -> 10*45 + 6.25*150 - 5*20 - 161 = 450 + 937.5 - 100 - 161 = 1126.5
        (20, "female", 150.0, 45.0, 1126.5),
    ],
)
def test_bmr_calculation_mifflin_st_jeor(age, sex, height_cm, weight_kg, expected_bmr):
    bmr, _ = calculate_bmr_tdee(age, sex, height_cm, weight_kg, "sedentary")
    assert bmr == pytest.approx(expected_bmr, abs=0.1)


@pytest.mark.parametrize(
    "activity, multiplier",
    [
        ("sedentary", 1.2),
        ("casual", 1.375),
        ("gym", 1.55),
        ("bodybuilder", 1.725),
        ("unknown_level", 1.375),  # fallback to casual
    ],
)
def test_tdee_multipliers(activity, multiplier):
    # Base: male, 30y, 175cm, 70kg -> raw BMR = 1648.75
    raw_bmr = 10 * 70.0 + 6.25 * 175.0 - 5 * 30 + 5
    bmr, tdee = calculate_bmr_tdee(30, "male", 175.0, 70.0, activity)
    assert bmr == round(raw_bmr, 1)
    expected_tdee = round(raw_bmr * multiplier, 1)
    assert tdee == expected_tdee


# ---------------------------------------------------------------------------
# Calorie & Macro Target Calculations
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "goal, expected_cal_factor, expected_protein_factor",
    [
        ("fat_loss", 0.80, 2.0),
        ("muscle_gain", 1.15, 1.8),
        ("recomp", 1.0, 2.2),
        ("maintenance", 1.0, 1.6),
        ("other_goal", 1.0, 1.6),
    ],
)
def test_calculate_targets_goals(goal, expected_cal_factor, expected_protein_factor):
    tdee = 2000.0
    weight_kg = 70.0
    targets = calculate_targets(tdee, goal, weight_kg)

    expected_calories = round(tdee * expected_cal_factor)
    expected_protein = round(expected_protein_factor * weight_kg, 1)
    expected_water = round(weight_kg * 0.035, 1)

    assert targets["target_calories"] == expected_calories
    assert targets["target_protein_g"] == expected_protein
    assert targets["target_water_l"] == expected_water


@pytest.mark.parametrize("goal", ["fat_loss", "muscle_gain", "recomp", "maintenance"])
@pytest.mark.parametrize("weight_kg", [55.0, 70.0, 90.0])
def test_macro_split_atwater_factor_equivalence(goal, weight_kg):
    """Grams multiplied by Atwater factors (4P + 4C + 9F) must equal target calories."""
    tdee = 2200.0
    targets = calculate_targets(tdee, goal, weight_kg)

    cal = targets["target_calories"]
    p = targets["target_protein_g"]
    c = targets["target_carbs_g"]
    f = targets["target_fat_g"]

    atwater_kcal = (p * 4.0) + (c * 4.0) + (f * 9.0)
    # Due to individual float rounding of target calories and macro grams, tolerance is within 3 kcal
    assert abs(atwater_kcal - cal) <= 3.0


def test_calculate_targets_carbs_clamped_to_zero():
    """If protein and fat kcal exceed total calories, carbs must not go negative."""
    # Ultra-low TDEE with high weight
    targets = calculate_targets(tdee=400.0, goal="fat_loss", weight_kg=120.0)
    assert targets["target_carbs_g"] >= 0.0


# ---------------------------------------------------------------------------
# ICMR-NIN 2020 RDA Values
# ---------------------------------------------------------------------------

def test_icmr_nin_2020_rda_structure_and_values():
    assert "male" in ICMR_NIN_2020_RDA
    assert "female" in ICMR_NIN_2020_RDA

    male_rda = ICMR_NIN_2020_RDA["male"]
    female_rda = ICMR_NIN_2020_RDA["female"]

    assert len(male_rda) >= 19
    assert len(female_rda) >= 19

    # Standard reference values
    assert male_rda["calcium_mg"] == 1000.0
    assert female_rda["calcium_mg"] == 1000.0
    assert male_rda["iron_mg"] == 19.0
    assert female_rda["iron_mg"] == 29.0  # Women require higher iron
    assert male_rda["vitc_mg"] == 80.0
    assert female_rda["vitc_mg"] == 65.0
    assert male_rda["fibre_g"] == 35.0
    assert female_rda["fibre_g"] == 30.0


# ---------------------------------------------------------------------------
# Meal Macros Calculation & Validation
# ---------------------------------------------------------------------------

def test_meal_macros_invalid_unit():
    res = calculate_meal_macros("ASC144", 1.0, unit="pieces")
    assert "error" in res
    assert "Invalid unit" in res["error"]


@pytest.mark.parametrize("invalid_qty", [0, -1, -0.5, None])
def test_meal_macros_invalid_quantity(invalid_qty):
    res = calculate_meal_macros("ASC144", invalid_qty, unit="serving")
    assert "error" in res
    assert "Quantity must be a positive number." in res["error"]


def test_meal_macros_bounds_ceilings():
    # Serving ceiling
    res_serv = calculate_meal_macros("ASC144", MAX_SERVINGS + 1, unit="serving")
    assert "error" in res_serv
    assert "too large" in res_serv["error"]

    # Grams ceiling
    res_grams = calculate_meal_macros("ASC144", MAX_GRAMS + 1, unit="grams")
    assert "error" in res_grams
    assert "too large" in res_grams["error"]


def test_meal_macros_unknown_food(mock_db):
    res = calculate_meal_macros("UNKNOWN_999", 1.0, unit="serving")
    assert "error" in res
    assert "Unknown food_code" in res["error"]


def test_meal_macros_serving_for_unreliable_food(mock_db):
    """Serving-based logging must be rejected for foods with quality != 'ok'."""
    res = calculate_meal_macros("UNR001", 1.0, unit="serving")
    assert "error" in res
    assert "doesn't have a reliable standard-serving size" in res["error"]
    assert res["fallback_unit"] == "grams"


def test_meal_macros_serving_for_grams_only_food(mock_db):
    res = calculate_meal_macros("GRO001", 1.0, unit="serving")
    assert "error" in res
    assert "doesn't have a reliable standard-serving size" in res["error"]


def test_meal_macros_valid_serving(mock_db):
    res = calculate_meal_macros("ASC144", 2.0, unit="serving")
    assert "error" not in res
    assert res["food_name"] == "Idli"
    assert res["unit"] == "serving"
    assert res["quantity"] == 2.0
    assert res["calories"] == 69.0  # 34.5 * 2
    assert res["protein_g"] == 2.4  # 1.2 * 2
    assert res["carbs_g"] == 14.2  # 7.1 * 2
    assert res["fat_g"] == 0.2  # 0.1 * 2


def test_meal_macros_valid_grams(mock_db):
    res = calculate_meal_macros("ASC144", 200.0, unit="grams")
    assert "error" not in res
    assert res["food_name"] == "Idli"
    assert res["unit"] == "grams"
    assert res["quantity"] == 200.0
    assert res["calories"] == 275.0  # 137.5 * 2
    assert res["protein_g"] == 9.2  # 4.6 * 2


def test_meal_macros_data_quality_warning(mock_db):
    """When a food row has quality_note, result must include data_quality_warning."""
    res = calculate_meal_macros("UNR001", 100.0, unit="grams")
    assert "error" not in res
    assert "data_quality_warning" in res
    assert "whole-recipe total" in res["data_quality_warning"]


def test_meal_macros_zero_energy_per_100g(mock_db):
    """Food row with 0 or missing energy_kcal_100g must return error when logged in grams."""
    conn = sqlite3.connect(mock_db)
    conn.execute("INSERT INTO food_items (food_code, food_name, energy_kcal_100g) VALUES ('ZERO01', 'Zero Kcal Food', 0)")
    conn.commit()
    conn.close()

    res = calculate_meal_macros("ZERO01", 100.0, unit="grams")
    assert "error" in res
    assert "No per-100g nutrition data" in res["error"]


def test_meal_macros_extract_micros_edge_values(mock_db):
    """Test _extract_micros handling non-numeric or null fields gracefully."""
    conn = sqlite3.connect(mock_db)
    conn.execute("""
        INSERT INTO food_items (
            food_code, food_name, quality, servings_unit, energy_kcal_100g, unit_serving_energy_kcal,
            calcium_mg_100g, vitd2_ug_100g, vitk1_ug_100g, folate_ug_100g
        ) VALUES (
            'MIC001', 'Micro Test Food', 'ok', 'cup', 100.0, 100.0,
            120.5, 2.5, 15.0, 50.0
        )
    """)
    conn.commit()
    conn.close()

    res = calculate_meal_macros("MIC001", 100.0, unit="grams")
    assert "error" not in res
    assert res["micros"] is not None
    assert res["micros"]["calcium_mg"] == 120.5
    assert res["micros"]["vitd_ug"] == 2.5
    assert res["micros"]["vitk_ug"] == 15.0
    assert res["micros"]["folate_ug"] == 50.0


def test_meal_macros_reference_staple_serving():
    """Built-in staples with serving defined (like milk) work with unit='serving'."""
    res = calculate_meal_macros("ref:milk", 1.0, unit="serving")
    assert "error" not in res
    assert res["food_name"] == "Milk, whole (cow)"
    assert res["calories"] > 0


# ---------------------------------------------------------------------------
# Remaining Daily Budget Calculations
# ---------------------------------------------------------------------------

def test_remaining_budget_unonboarded(mock_db):
    res = get_remaining_budget_today("2026-10-18")
    assert "error" in res
    assert res["error"] == "User not onboarded yet."


def test_remaining_budget_with_logs(mock_db):
    conn = sqlite3.connect(mock_db)
    conn.execute("""
        INSERT INTO user_profile (id, name, target_calories, target_protein_g, target_carbs_g, target_fat_g, target_water_l)
        VALUES (1, 'Test User', 2000.0, 150.0, 200.0, 55.0, 3.0)
    """)
    conn.execute("""
        INSERT INTO daily_logs (log_date, food_name, calories, protein_g, carbs_g, fat_g)
        VALUES ('2026-10-18', 'Meal 1', 500.0, 40.0, 50.0, 15.0),
               ('2026-10-18', 'Meal 2', 700.0, 50.0, 80.0, 20.0)
    """)
    conn.commit()
    conn.close()

    budget = get_remaining_budget_today("2026-10-18")
    assert "error" not in budget
    assert budget["consumed_calories"] == 1200.0
    assert budget["consumed_protein_g"] == 90.0
    assert budget["remaining_calories"] == 800.0
    assert budget["remaining_protein_g"] == 60.0
    assert budget["remaining_carbs_g"] == 70.0
    assert budget["remaining_fat_g"] == 20.0
    assert budget["target_water_l"] == 3.0
