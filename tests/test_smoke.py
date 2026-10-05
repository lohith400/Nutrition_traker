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
    for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "LLM_PROVIDER", "LLM_MODEL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"):
        os.environ[var] = ""
    os.environ["NUTRISYNC_NO_SCHEDULER"] = "1"  # tests drive reminders.run_due() by hand

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_file:
        tmp_db_path = tmp_file.name

    os.environ["NUTRISYNC_DB_PATH"] = tmp_db_path

    # Set up DB tables from anuvaad.xlsx
    from backend import db_setup
    db_setup.DB_PATH = tmp_db_path
    db_setup.build_database()

    # Re-bind DB_PATH on all backend modules
    from backend import google_fit, math_engine, memory_agent, menu_planner, orchestrator, rag_resolver, reminders
    from backend.app import app

    math_engine.DB_PATH = tmp_db_path
    memory_agent.DB_PATH = tmp_db_path
    menu_planner.DB_PATH = tmp_db_path
    rag_resolver.DB_PATH = tmp_db_path
    google_fit.DB_PATH = tmp_db_path
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
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "NutriSync API"
    assert "server_time" in body


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


def test_llm_each_single_key_works(monkeypatch):
    """Only one of the three keys filled (others blank) -> that provider is used."""
    from backend import llm_config
    all_vars = ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_MODEL", "GEMINI_MODEL",
                "DEEPSEEK_MODEL", "LLM_PROVIDER", "LLM_MODEL")
    cases = {
        "OPENROUTER_API_KEY": ("openrouter", "openai/gpt-4o-mini", "openrouter.ai"),
        "GEMINI_API_KEY": ("gemini", "auto", "generativelanguage.googleapis.com"),
        "DEEPSEEK_API_KEY": ("deepseek", "deepseek-chat", "api.deepseek.com"),
    }
    for key_var, (provider, model, host) in cases.items():
        for var in all_vars:
            monkeypatch.setenv(var, "")  # blank, like an empty line in .env
        monkeypatch.setenv(key_var, "test-key-123")
        s = llm_config.resolve_settings()
        assert s["provider"] == provider and s["model"] == model and host in s["base_url"]
        client, m, p = llm_config.build_client()
        assert client is not None and m == model and p == provider

    for var in all_vars:
        monkeypatch.setenv(var, "")
    assert llm_config.build_client()[0] is None  # nothing filled -> not configured
    monkeypatch.setenv("GEMINI_API_KEY", "your_gemini_api_key_here")  # untouched placeholder
    assert llm_config.build_client()[0] is None
    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "k2")
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    assert llm_config.resolve_settings()["provider"] == "deepseek"
    monkeypatch.setenv("LLM_PROVIDER", "")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-pro")
    assert llm_config.resolve_settings()["model"] == "gemini-2.5-pro"


def test_gemini_auto_picks_newest_and_survives_retired_model(monkeypatch):
    """Gemini with no model set: newest Flash is chosen; a 404 'no longer available' falls back."""
    from types import SimpleNamespace
    from backend import llm_config

    for var in ("OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_MODEL", "LLM_MODEL", "LLM_PROVIDER"):
        monkeypatch.setenv(var, "")
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaFake")
    _, model, provider = llm_config.build_client()
    assert (provider, model) == ("gemini", "auto")

    class NotFound(Exception):
        status_code = 404

    listed = ["models/gemini-2.5-flash", "models/gemini-3.8-flash", "models/gemini-3.8-flash-lite",
              "models/gemini-3.8-pro", "models/gemini-3.8-flash-image", "models/text-embedding-004",
              "models/gemini-2.5-flash-preview-tts", "models/gemini-flash-latest"]
    calls = []

    def create(**kw):
        calls.append(kw["model"])
        if kw["model"] == "gemini-3.8-flash":
            raise NotFound("This model is no longer available to new users")
        return SimpleNamespace(ok=kw["model"])

    fake = SimpleNamespace(
        models=SimpleNamespace(list=lambda: [SimpleNamespace(id=i) for i in listed]),
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)),
    )
    # 1) newest flash is tried first, 404 -> falls back to the next candidate and remembers it
    assert llm_config.create_completion(fake, model="auto", messages=[]).ok == "gemini-3.8-flash-lite"
    assert calls[0] == "gemini-3.8-flash"
    assert llm_config.create_completion(fake, model="auto", messages=[]).ok == "gemini-3.8-flash-lite"
    assert calls[-1] == "gemini-3.8-flash-lite" and len(calls) == 3  # no re-probing once a model works

    # 2) a user-pinned retired model also falls back instead of erroring
    llm_config.build_client()
    calls.clear()
    assert llm_config.create_completion(fake, model="gemini-2.0-flash", messages=[]).ok
    # 3) non-model errors (auth / quota) are NOT swallowed
    class Auth(Exception):
        status_code = 401
    def bad(**kw):
        raise Auth("invalid api key")
    fake.chat.completions.create = bad
    llm_config.build_client()
    with pytest.raises(Auth):
        llm_config.create_completion(fake, model="auto", messages=[])


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


def test_reminders_fire_log_and_skip_stale(test_client):
    from datetime import datetime
    from backend import memory_agent, reminders

    test_client.post("/api/profile/onboarding", json={
        "name": "T", "age": 25, "sex": "male", "height_cm": 175, "current_weight_kg": 70,
        "target_weight_kg": 68, "goal": "lose_weight", "activity_level": "moderate", "diet": "any"})

    bad = test_client.post("/api/reminders", json={"kind": "food", "time": "14:00", "food_name": "zzzqqq"})
    assert bad.status_code == 422
    assert test_client.post("/api/reminders", json={"kind": "water", "time": "99:99"}).status_code == 422

    food = test_client.post("/api/reminders", json={"kind": "food", "time": "14:00", "food_name": "idli", "quantity": 2})
    water = test_client.post("/api/reminders", json={"kind": "water", "time": "10:00", "water_ml": 300})
    assert food.status_code == 200 and water.status_code == 200

    today = datetime.now().strftime("%Y-%m-%d")
    at = lambda hm: datetime.strptime(f"{today} {hm}", "%Y-%m-%d %H:%M")

    assert reminders.run_due(at("13:59")) == []                      # not due yet
    water_before = memory_agent.get_todays_water()["consumed_water_l"]
    fired = reminders.run_due(at("14:01"))
    assert len(fired) == 1 and fired[0]["logged"]                    # food fired + logged
    assert "Idli" in [m["food_name"] for m in memory_agent.get_todays_logs()["meals"]]
    assert memory_agent.get_todays_water()["consumed_water_l"] == water_before  # 10:00 water was >15 min late: skipped
    assert len(test_client.get("/api/reminders/events").json()["events"]) == 1  # only the food one fired


def test_fitness_today_endpoint(test_client):
    res = test_client.get("/api/fitness/today")
    assert res.status_code == 200
    data = res.json()
    assert "date" in data
    assert "steps" in data
    assert "calories_burned" in data
    assert "running_minutes" in data


def test_google_fit_aggregation(monkeypatch):
    import asyncio
    from backend import google_fit

    # Mock get_fresh_access_token and httpx client call
    async def mock_token():
        return "mock_token_123"

    monkeypatch.setattr(google_fit, "is_configured", lambda: True)
    monkeypatch.setattr(google_fit, "get_fresh_access_token", mock_token)

    mock_google_response = {
        "bucket": [
            {
                "dataset": [
                    {
                        "point": [
                            {
                                "dataTypeName": "com.google.step_count.delta",
                                "value": [{"intVal": 1394}],
                            }
                        ]
                    },
                    {
                        "point": [
                            {
                                "dataTypeName": "com.google.calories.expended",
                                "value": [{"fpVal": 1509.9}],
                            }
                        ]
                    },
                    {
                        "point": [
                            {
                                "dataTypeName": "com.google.activity.segment",
                                "startTimeNanos": "1600000000000000000",
                                "endTimeNanos": "1600001800000000000",  # 1800 seconds = 30 minutes
                                "value": [{"intVal": 8}],  # Type 8 = running
                            }
                        ]
                    },
                ]
            }
        ]
    }

    class MockResponse:
        status_code = 200
        def json(self):
            return mock_google_response

    class MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def post(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr(google_fit.httpx, "AsyncClient", MockAsyncClient)

    summary = asyncio.run(google_fit.fetch_fitness_summary())
    assert summary["status"] == "ok"
    assert summary["steps"] == 1394
    assert summary["calories_burned"] == 1509.9
    assert summary["running_minutes"] == 30.0


def test_fitness_sync_and_history(test_client, monkeypatch):
    import asyncio
    from datetime import datetime, timedelta
    from backend import google_fit

    async def mock_summary(target_date=None):
        return {
            "status": "ok",
            "configured": True,
            "date": (target_date or datetime.now()).strftime("%Y-%m-%d"),
            "steps": 8500,
            "calories_burned": 520.0,
            "running_minutes": 25.0,
            "distance_km": 6.38,
            "active_minutes": 25.0,
        }

    monkeypatch.setattr(google_fit, "fetch_fitness_summary", mock_summary)

    # Sync today
    synced = asyncio.run(google_fit.sync_today_fitness())
    assert synced["status"] == "ok"
    assert synced["steps"] == 8500

    # Query endpoint
    res = test_client.get("/api/fitness/today")
    assert res.status_code == 200
    data = res.json()
    assert data["steps"] == 8500
    assert data["calories_burned"] == 520.0

    # Query history
    hist_res = test_client.get("/api/fitness/history?days=7")
    assert hist_res.status_code == 200
    hist = hist_res.json()
    assert "days" in hist
    assert len(hist["days"]) >= 1
    assert any(d["steps"] == 8500 for d in hist["days"])


def test_coach_fitness_tool_and_context(test_client):
    from backend import orchestrator

    ctx = orchestrator._context()
    assert "daily_fitness" in ctx

    tool_res = orchestrator.TOOL_IMPL["get_fitness_summary"]({"days": 1})
    assert tool_res["status"] == "ok"
    assert "today" in tool_res or "days" in tool_res


def test_health_insights_endpoint(test_client):
    res = test_client.get("/api/health/insights?days=7")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("ok", "unonboarded")
    if data["status"] == "ok":
        assert "math" in data
        assert "bmr" in data["math"]
        assert "rows" in data