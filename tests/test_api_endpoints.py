import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
for p in (BACKEND_DIR, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """Set up an isolated temporary SQLite database for API route testing."""
    for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "LLM_PROVIDER", "LLM_MODEL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"):
        os.environ[var] = ""
    os.environ["NUTRISYNC_NO_SCHEDULER"] = "1"

    tmp_dir = tmp_path_factory.mktemp("api_test_db")
    db_path = str(tmp_dir / "api_test.db")

    src_db = ROOT / "nutrisync.db"
    if src_db.exists():
        shutil.copyfile(src_db, db_path)
    else:
        from backend import db_setup
        db_setup.DB_PATH = db_path
        db_setup.build_database()

    os.environ["NUTRISYNC_DB_PATH"] = db_path

    from backend import google_fit, math_engine, memory_agent, menu_planner, orchestrator, rag_resolver
    from backend.app import app

    math_engine.DB_PATH = db_path
    memory_agent.DB_PATH = db_path
    menu_planner.DB_PATH = db_path
    rag_resolver.DB_PATH = db_path
    google_fit.DB_PATH = db_path
    orchestrator.client = None
    rag_resolver._index_cache.update(key=None, rows=[])

    client_instance = TestClient(app)
    yield client_instance


# ---------------------------------------------------------------------------
# 1. Health & Status
# ---------------------------------------------------------------------------

def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "NutriSync API"
    assert "server_time" in data


# ---------------------------------------------------------------------------
# 2. Profile & Onboarding Validation
# ---------------------------------------------------------------------------

def test_profile_endpoint(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, dict)


def test_onboarding_validation_invalid_input(client):
    # Missing required name & age
    res = client.post("/api/profile/onboarding", json={"age": -5})
    assert res.status_code == 422


def test_onboarding_success(client):
    payload = {
        "name": "Integration User",
        "age": 29,
        "sex": "male",
        "height_cm": 176.0,
        "current_weight_kg": 72.0,
        "target_weight_kg": 68.0,
        "goal": "fat_loss",
        "activity_level": "gym",
        "allergies": "",
        "medical_conditions": "",
        "sleep_schedule": "23:00 - 07:00",
        "diet": "any",
    }
    res = client.post("/api/profile/onboarding", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "onboarded"
    assert data["target_calories"] > 0


# ---------------------------------------------------------------------------
# 3. Overview & Insights
# ---------------------------------------------------------------------------

def test_overview_endpoint(client):
    res = client.get("/api/overview")
    assert res.status_code == 200
    data = res.json()
    assert "target_calories" in data
    assert "remaining_calories" in data


def test_health_insights_endpoint(client):
    res = client.get("/api/health/insights")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("ok", "unonboarded")


# ---------------------------------------------------------------------------
# 4. Food Search & Options
# ---------------------------------------------------------------------------

def test_food_search_query(client):
    res = client.get("/api/food-search?q=idli")
    assert res.status_code == 200
    data = res.json()
    results = data.get("results", data if isinstance(data, list) else [])
    assert len(results) >= 1
    assert any("idli" in i["food_name"].lower() for i in results)


def test_food_options_query(client):
    res = client.get("/api/food-options?q=idli&limit=5")
    assert res.status_code == 200
    data = res.json()
    assert "options" in data
    assert data["query"] == "idli"
    assert len(data["options"]) >= 1


# ---------------------------------------------------------------------------
# 5. Food Logging & Input Validation
# ---------------------------------------------------------------------------

def test_log_food_valid(client):
    payload = {
        "item_name": "Idli",
        "quantity": 2.0,
        "unit": "serving",
        "meal_type": "breakfast",
    }
    res = client.post("/api/log-food", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "logged"
    assert data["calories"] > 0


def test_log_food_invalid_quantity(client):
    payload = {
        "item_name": "Idli",
        "quantity": -2.0,
        "unit": "serving",
        "meal_type": "breakfast",
    }
    res = client.post("/api/log-food", json=payload)
    assert res.status_code == 422


def test_log_food_invalid_unit(client):
    payload = {
        "item_name": "Idli",
        "quantity": 1.0,
        "unit": "buckets",
        "meal_type": "breakfast",
    }
    res = client.post("/api/log-food", json=payload)
    assert res.status_code == 422


def test_log_food_not_found(client):
    payload = {
        "item_name": "NonExistentExtraterrestrialFood9999",
        "quantity": 1.0,
        "unit": "serving",
        "meal_type": "lunch",
    }
    res = client.post("/api/log-food", json=payload)
    assert res.status_code == 404


def test_log_food_code_valid_and_future_date(client):
    # Valid code
    res_valid = client.post("/api/log-food-code", json={"food_code": "ASC144", "quantity": 1.0, "unit": "serving"})
    assert res_valid.status_code == 200

    # Future date validation error
    res_future = client.post("/api/log-food-code", json={"food_code": "ASC144", "quantity": 1.0, "date": "2099-01-01"})
    assert res_future.status_code == 422


# ---------------------------------------------------------------------------
# 6. Water, Weight & Habit Logging
# ---------------------------------------------------------------------------

def test_log_water_valid_and_invalid(client):
    # Valid
    res_ok = client.post("/api/log-water", json={"amount_l": 0.25})
    assert res_ok.status_code == 200
    assert res_ok.json()["status"] == "logged"

    # Invalid negative
    res_bad = client.post("/api/log-water", json={"amount_l": -1.0})
    assert res_bad.status_code == 422


def test_weight_endpoints(client):
    # Get current weight history
    res_get = client.get("/api/weight")
    assert res_get.status_code == 200

    # Post valid weight
    res_post = client.post("/api/weight", json={"weight_kg": 71.5})
    assert res_post.status_code == 200
    assert res_post.json()["status"] == "logged"

    # Post invalid weight
    res_bad = client.post("/api/weight", json={"weight_kg": -20.0})
    assert res_bad.status_code == 422


# ---------------------------------------------------------------------------
# 7. Suggestions & Grocery
# ---------------------------------------------------------------------------

def test_suggestions_endpoint(client):
    res = client.get("/api/suggestions")
    assert res.status_code == 200


def test_grocery_endpoints(client):
    # Get grocery list
    res_get = client.get("/api/grocery")
    assert res_get.status_code == 200
    assert "items" in res_get.json()

    # Add item
    res_add = client.post("/api/grocery", json={"name": "Oats", "quantity": 500, "unit": "g"})
    assert res_add.status_code == 200
    assert res_add.json()["status"] == "ok"

    # Invalid empty name
    res_bad = client.post("/api/grocery", json={"name": "", "quantity": 1})
    assert res_bad.status_code == 422


# ---------------------------------------------------------------------------
# 8. Custom Foods Recipe Builder
# ---------------------------------------------------------------------------

def test_custom_foods_analyze_and_list(client):
    # List
    res_list = client.get("/api/custom-foods")
    assert res_list.status_code == 200

    # Analyze recipe
    recipe_payload = {
        "name": "Homemade Poha",
        "servings": 1,
        "ingredients": [
            {"name": "poha", "quantity": 60, "unit": "g"},
            {"name": "oil", "quantity": 1, "unit": "tbsp"},
        ],
    }
    res_analyze = client.post("/api/custom-foods/analyze", json=recipe_payload)
    assert res_analyze.status_code == 200
    data = res_analyze.json()
    assert data["status"] == "ok"
    assert "totals" in data


# ---------------------------------------------------------------------------
# 9. Autocomplete, Options, History & Reminders Events
# ---------------------------------------------------------------------------

def test_food_search_and_options(client):
    # Search autocomplete
    res_search = client.get("/api/food-search?q=dosa")
    assert res_search.status_code == 200
    assert "results" in res_search.json()

    # Options
    res_opt = client.get("/api/food-options?q=idli")
    assert res_opt.status_code == 200


def test_chat_history_endpoints(client):
    # GET history
    res_get = client.get("/api/chat/history")
    assert res_get.status_code == 200
    assert "messages" in res_get.json()

    # DELETE history
    res_del = client.delete("/api/chat/history")
    assert res_del.status_code == 200


def test_reminder_events_endpoint(client):
    res = client.get("/api/reminders/events")
    assert res.status_code == 200
    assert "events" in res.json()

