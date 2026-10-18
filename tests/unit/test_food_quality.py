"""Unit tests for the Food Quality Gate and Diet Tagging (backend/food_quality.py).

Tests row assessment rules (implausible densities, whole-recipe totals, Atwater discrepancies),
diet normalization, keyword and curated diet tagging, allowed diet sets, and meal role classification.
"""
import pytest

from backend.food_quality import (
    ATWATER_TOLERANCE,
    MAX_FAT_100G,
    MAX_KCAL_100G,
    MAX_SERVING_GRAMS,
    MAX_SERVING_KCAL,
    allowed_diet_tags,
    assess,
    diet_tag,
    meal_role,
    normalize_diet,
)


# ---------------------------------------------------------------------------
# Data Quality Gate: assess(row)
# ---------------------------------------------------------------------------

def test_assess_valid_food_ok():
    row = {
        "energy_kcal_100g": 137.5,
        "protein_g_100g": 4.6,
        "carb_g_100g": 28.2,
        "fat_g_100g": 0.3,
        "unit_serving_energy_kcal": 34.5,
        "servings_unit": "idli",
    }
    res = assess(row)
    assert res["quality"] == "ok"
    assert res["quality_note"] is None
    assert res["serving_grams"] == 25


def test_assess_zero_or_negative_energy_unreliable():
    row = {
        "energy_kcal_100g": 0,
        "protein_g_100g": 0,
        "carb_g_100g": 0,
        "fat_g_100g": 0,
        "unit_serving_energy_kcal": 0,
        "servings_unit": "serving",
    }
    res = assess(row)
    assert res["quality"] == "unreliable"
    assert "no energy value in source data" in res["quality_note"]


def test_assess_implausibly_dense_calories_unreliable():
    row = {
        "energy_kcal_100g": MAX_KCAL_100G + 50,  # 750 kcal/100g
        "protein_g_100g": 10.0,
        "carb_g_100g": 20.0,
        "fat_g_100g": 40.0,
        "unit_serving_energy_kcal": 100.0,
        "servings_unit": "serving",
    }
    res = assess(row)
    assert res["quality"] == "unreliable"
    assert "per-100g values look implausibly high" in res["quality_note"]


def test_assess_implausibly_high_fat_unreliable():
    row = {
        "energy_kcal_100g": 550.0,
        "protein_g_100g": 5.0,
        "carb_g_100g": 5.0,
        "fat_g_100g": MAX_FAT_100G + 5,  # 55g fat/100g
        "unit_serving_energy_kcal": 100.0,
        "servings_unit": "serving",
    }
    res = assess(row)
    assert res["quality"] == "unreliable"
    assert "per-100g values look implausibly high" in res["quality_note"]


def test_assess_atwater_discrepancy_unreliable():
    """When stated calories diverge from 4P + 4C + 9F by >25 kcal and >35%."""
    # Stated 100 kcal, but 4*10 + 4*20 + 9*10 = 40 + 80 + 90 = 210 kcal
    row = {
        "energy_kcal_100g": 100.0,
        "protein_g_100g": 10.0,
        "carb_g_100g": 20.0,
        "fat_g_100g": 10.0,
        "unit_serving_energy_kcal": 50.0,
        "servings_unit": "serving",
    }
    res = assess(row)
    assert res["quality"] == "unreliable"
    assert "macros don't add up to the stated calories" in res["quality_note"]


def test_assess_whole_recipe_total_serving_grams_only():
    """One serving > 700 kcal is flagged as a recipe total -> grams_only."""
    row = {
        "energy_kcal_100g": 180.0,
        "protein_g_100g": 6.0,
        "carb_g_100g": 22.0,
        "fat_g_100g": 7.0,
        "unit_serving_energy_kcal": MAX_SERVING_KCAL + 100,  # 800 kcal
        "servings_unit": "plate",
    }
    res = assess(row)
    assert res["quality"] == "grams_only"
    assert "whole-recipe total" in res["quality_note"]
    assert res["serving_grams"] is None


def test_assess_unrealistic_serving_weight_grams_only():
    """Implied serving weight (serving_kcal / kcal_100g * 100) > 800g."""
    row = {
        "energy_kcal_100g": 50.0,
        "protein_g_100g": 2.0,
        "carb_g_100g": 8.0,
        "fat_g_100g": 1.0,
        "unit_serving_energy_kcal": 450.0,  # 450 / 50 * 100 = 900g (> 800g limit)
        "servings_unit": "bowl",
    }
    res = assess(row)
    assert res["quality"] == "grams_only"
    assert "implied serving weight is unrealistic" in res["quality_note"]


def test_assess_no_serving_size_grams_only():
    """When a food has no serving unit or 0 serving kcal, only grams are offered."""
    row = {
        "energy_kcal_100g": 348.0,
        "protein_g_100g": 24.0,
        "carb_g_100g": 59.9,
        "fat_g_100g": 1.2,
        "unit_serving_energy_kcal": 0,
        "servings_unit": "",
    }
    res = assess(row)
    assert res["quality"] == "grams_only"
    assert "no serving size in source data" in res["quality_note"]


# ---------------------------------------------------------------------------
# Diet Normalization
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw_input, expected",
    [
        ("veg", "vegetarian"),
        ("vegetarian", "vegetarian"),
        ("pure_veg", "vegetarian"),
        ("Pure Veg", "vegetarian"),
        ("lacto_vegetarian", "vegetarian"),
        ("lacto-vegetarian", "vegetarian"),
        ("vegan", "vegan"),
        ("plant_based", "vegan"),
        ("plant-based", "vegan"),
        ("egg", "eggetarian"),
        ("eggetarian", "eggetarian"),
        ("ovo_vegetarian", "eggetarian"),
        ("ovo", "eggetarian"),
        ("any", "any"),
        ("non_veg", "any"),
        (None, "any"),
        ("", "any"),
        ("random_string", "any"),
    ],
)
def test_normalize_diet(raw_input, expected):
    assert normalize_diet(raw_input) == expected


# ---------------------------------------------------------------------------
# Diet Tagging Heuristics
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "food_name, expected_tag",
    [
        # Non-veg keywords
        ("Chicken Biryani", "non_veg"),
        ("Mutton Rogan Josh", "non_veg"),
        ("Fish Curry", "non_veg"),
        ("Prawns Masala", "non_veg"),
        ("Eggplant Mince Kheema", "non_veg"),
        ("Machli Fry", "non_veg"),
        # Curated regional non-veg names without standard keyword
        ("roghan josh", "non_veg"),
        ("boti kebab", "non_veg"),
        ("mutton chops", "non_veg"),
        ("tandoori chicken", "non_veg"),
        ("scotch egg", "non_veg"),
        # Eggetarian dishes
        ("Boiled Egg", "eggetarian"),
        ("Masala Omelette", "eggetarian"),
        ("Anda Bhurji", "eggetarian"),
        ("Eggnog", "eggetarian"),
        # Vegetarian (dairy containing)
        ("Paneer Butter Masala", "vegetarian"),
        ("Curd Rice", "vegetarian"),
        ("Ghee Roast Dosa", "vegetarian"),
        ("Sweet Lassi", "vegetarian"),
        ("Gulab Jamun", "vegetarian"),
        ("Milkshake", "vegetarian"),
        # Vegan default
        ("Plain Steamed Rice", "vegan"),
        ("Idli", "vegan"),
        ("Toor Dal Tadka", "vegan"),
        ("Banana", "vegan"),
        ("Aloo Gobi Dry", "vegan"),
    ],
)
def test_diet_tag(food_name, expected_tag):
    assert diet_tag(food_name) == expected_tag


def test_diet_tag_non_veg_precedence_over_dairy():
    """Dishes like 'Butter chicken' or 'Chicken Tikka with Raita' must tag non_veg."""
    assert diet_tag("Butter Chicken") == "non_veg"
    assert diet_tag("Chicken Korma with Malai") == "non_veg"


# ---------------------------------------------------------------------------
# Allowed Diet Tags Mapping
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "user_diet, allowed_set",
    [
        ("vegan", {"vegan"}),
        ("vegetarian", {"vegan", "vegetarian"}),
        ("eggetarian", {"vegan", "vegetarian", "eggetarian"}),
        ("any", {"vegan", "vegetarian", "eggetarian", "non_veg"}),
    ],
)
def test_allowed_diet_tags(user_diet, allowed_set):
    assert allowed_diet_tags(user_diet) == allowed_set


# ---------------------------------------------------------------------------
# Meal Role Classification
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "dish_name, expected_role",
    [
        # Excluded condiments/bases
        ("Mango Pickle", "excluded"),
        ("Mint Chutney", "excluded"),
        ("Garam Masala Mix", "excluded"),
        ("Ginger Garlic Paste", "excluded"),
        # Desserts
        ("Kaju Katli Sweet", "dessert"),
        ("Rice Kheer", "dessert"),
        ("Gajar Halwa", "dessert"),
        ("Rasgulla", "dessert"),
        # Drinks
        ("South Indian Filter Coffee", "drink"),
        ("Hot Tea", "drink"),
        ("Salted Lassi", "drink"),
        ("Lemonade", "drink"),
        ("Chaas", "drink"),
        # Sides
        ("Boondi Raita", "side"),
        ("Tomato Soup", "side"),
        ("Kachumber Salad", "side"),
        # Breakfast
        ("Steamed Idli", "breakfast"),
        ("Masala Dosa", "breakfast"),
        ("Poha with Peanuts", "breakfast"),
        ("Rava Upma", "breakfast"),
        # Staples
        ("Tawa Roti", "staple"),
        ("Phulka", "staple"),
        ("Steamed Basmati Rice", "staple"),
        ("Jeera Pulao", "staple"),
        # Snacks
        ("Samosa", "snack"),
        ("Aloo Tikki", "snack"),
        ("Onion Pakoda", "snack"),
        ("Paneer Tikka", "snack"),
        # Main dishes
        ("Chole Masala", "main"),
        ("Rajma Gravy", "main"),
        ("Mixed Vegetable Korma", "main"),
    ],
)
def test_meal_role_classification(dish_name, expected_role):
    assert meal_role(dish_name) == expected_role


@pytest.mark.xfail(
    reason="Bug in food_quality.py: _DRINK regex omits 'chai', so 'Masala Chai' falls through to 'main'",
    strict=True,
)
def test_meal_role_masala_chai_xfail():
    assert meal_role("Masala Chai") == "drink"


@pytest.mark.xfail(
    reason="Bug in food_quality.py: _DESSERT matches 'sweet' before _DRINK matches 'lassi', tagging 'Sweet Lassi' as dessert",
    strict=True,
)
def test_meal_role_sweet_lassi_xfail():
    assert meal_role("Sweet Lassi") == "drink"
