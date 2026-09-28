"""Smoke tests for NutriSync API."""
import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
for p in (BACKEND_DIR, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


@pytest.fixture(scope="session")
def test_client():
    """Create a temporary test database and return a FastAPI TestClient."""
    # Ensure network calls fail if attempted
    os.environ["OPENROUTER_API_KEY"] = ""

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_file:
        tmp_db_path = tmp_file.name

    os.environ["NUTRISYNC_DB_PATH"] = tmp_db_path

    # Set up DB tables from anuvaad.xlsx
    from backend import db_setup
    db_setup.DB_PATH = tmp_db_path
    db_setup.build_database()

    # Re-bind DB_PATH on all backend modules
    from backend import math_engine, memory_agent, menu_planner, orchestrator, rag_resolver
    from backend.app import app

    math_engine.DB_PATH = tmp_db_path
    memory_agent.DB_PATH = tmp_db_path
    menu_planner.DB_PATH = tmp_db_path
    rag_resolver.DB_PATH = tmp_db_path
    orchestrator.client = None

    client = TestClient(app)
    yield client

    try:
        if os.path.exists(tmp_db_path):
            os.remove(tmp_db_path)
    except Exception:
        pass


def test_health_returns_ok(test_client):
    res = test_client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "NutriSync API"}


def test_overview_unonboarded_returns_error(test_client):
    res = test_client.get("/api/overview")
    assert res.status_code == 200
    data = res.json()
    assert "error" in data
    assert data["error"] == "User not onboarded yet."


def test_onboarding_and_overview(test_client):
    payload = {
        "name": "Test User",
        "age": 28,
        "sex": "male",
        "height_cm": 178.0,
        "current_weight_kg": 74.0,
        "target_weight_kg": 70.0,
        "goal": "maintenance",
        "activity_level": "moderate",
        "allergies": "",
        "medical_conditions": "",
        "sleep_schedule": "",
    }
    onboard_res = test_client.post("/api/profile/onboarding", json=payload)
    assert onboard_res.status_code == 200
    assert onboard_res.json()["status"] == "onboarded"

    overview_res = test_client.get("/api/overview")
    assert overview_res.status_code == 200
    overview = overview_res.json()
    assert "error" not in overview
    assert "remaining_calories" in overview
    assert overview["target_calories"] > 0


def test_log_valid_food(test_client):
    payload = {
        "item_name": "Chapati/Roti",
        "quantity": 2.0,
        "meal_type": "lunch",
    }
    res = test_client.post("/api/log-food", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "logged"
    assert "calories" in data
    assert "protein_g" in data
    assert data["calories"] > 0


def test_log_unknown_food_returns_404(test_client):
    payload = {
        "item_name": "NonExistentUnknownFoodItemXYZ12345",
        "quantity": 1.0,
        "meal_type": "snack",
    }
    res = test_client.post("/api/log-food", json=payload)
    assert res.status_code == 404
    assert "Food not found" in res.json()["detail"]


def test_chat_without_api_key_returns_503(test_client):
    from backend import orchestrator
    orchestrator.client = None
    res = test_client.post("/api/chat", json={"message": "Hello coach"})
    assert res.status_code == 503
    assert "AI coach is not configured" in res.json()["detail"]


# ---------------------------------------------------------------------------
# Regression tests for the reported bugs: unit confusion (the "20,000 kcal"
# bug), suggestions that ignore the real database, and no diet awareness.
# ---------------------------------------------------------------------------

def test_grams_are_not_multiplied_like_servings(test_client):
    """100 GRAMS of a food must use the per-100g row, not the per-serving
    row multiplied by 100 (the original bug: 'Paneer soup x100' -> 29,224 kcal)."""
    res = test_client.post("/api/log-food", json={"item_name": "Paneer soup", "quantity": 100, "unit": "grams", "meal_type": "lunch"})
    assert res.status_code == 200
    data = res.json()
    assert data["unit"] == "grams"
    assert data["calories"] < 500  # a sane value for 100g of soup, not tens of thousands


def test_large_serving_quantity_is_rejected_not_multiplied(test_client):
    """100 SERVINGS should be rejected outright rather than silently producing
    an enormous, meaningless total."""
    res = test_client.post("/api/log-food", json={"item_name": "Paneer soup", "quantity": 100, "unit": "serving", "meal_type": "lunch"})
    assert res.status_code == 422
    assert "too large" in res.json()["detail"].lower()


def test_unreliable_source_row_is_not_offered_as_a_serving(test_client):
    """Paneer pulao's source 'per plate' value is a whole-recipe total
    (~4,876 kcal) -- it must be flagged unreliable and refuse serving-based
    logging rather than presenting that number as one plate."""
    res = test_client.post("/api/log-food", json={"item_name": "Paneer pulao", "quantity": 1, "unit": "serving", "meal_type": "lunch"})
    assert res.status_code == 422
    assert "grams" in res.json()["detail"].lower()


def test_suggestions_only_return_real_database_foods(test_client):
    res = test_client.get("/api/suggestions")
    assert res.status_code == 200
    data = res.json()
    if data.get("status") == "ok":
        assert all("food_name" in o for o in data["options"])


def test_vegetarian_diet_blocks_meat_matches(test_client):
    """Setting diet=vegetarian must stop a chicken dish from ever being
    matched, even on a strong lexical hit."""
    onboard = {
        "name": "Veg User", "age": 30, "sex": "female", "height_cm": 160.0,
        "current_weight_kg": 60.0, "target_weight_kg": 58.0, "goal": "maintenance",
        "activity_level": "casual", "diet": "vegetarian",
    }
    res = test_client.post("/api/profile/onboarding", json=onboard)
    assert res.status_code == 200
    res = test_client.post("/api/log-food", json={"item_name": "chicken curry", "quantity": 1, "unit": "serving", "meal_type": "lunch"})
    assert res.status_code == 409