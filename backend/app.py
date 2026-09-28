"""NutriSync HTTP API."""
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DIR = Path(__file__).resolve().parent
ROOT = DIR.parent
load_dotenv(DIR / ".env")
load_dotenv(ROOT / ".env")
for p in (DIR, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from backend import math_engine, memory_agent, menu_planner, orchestrator, rag_resolver  # noqa: E402
except ImportError:
    import math_engine, memory_agent, menu_planner, orchestrator, rag_resolver  # noqa: E402

app = FastAPI(title="NutriSync API", version="0.4.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class OnboardingRequest(BaseModel):
    name: str = Field(min_length=1)
    age: int = Field(gt=12, lt=100)
    sex: str
    height_cm: float = Field(gt=80, lt=250)
    current_weight_kg: float = Field(gt=25, lt=300)
    target_weight_kg: float = Field(gt=25, lt=300)
    goal: str
    activity_level: str
    diet: str = "any"
    allergies: str = ""
    medical_conditions: str = ""
    sleep_schedule: str = ""


class FoodLogRequest(BaseModel):
    item_name: str = Field(min_length=1)
    quantity: float = Field(default=1.0, gt=0, le=2000)
    unit: Literal["serving", "grams"] = "serving"
    meal_type: str = "snack"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class WaterLogRequest(BaseModel):
    amount_l: float = Field(gt=0, le=5)


@app.get("/health")
def health():
    return {"status": "ok", "service": "NutriSync API"}


@app.get("/api/profile")
def get_profile():
    return memory_agent.get_user_profile()


@app.post("/api/profile/onboarding")
def save_onboarding(payload: OnboardingRequest):
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    bmr, tdee = math_engine.calculate_bmr_tdee(data["age"], data["sex"], data["height_cm"], data["current_weight_kg"], data["activity_level"])
    targets = math_engine.calculate_targets(tdee, data["goal"], data["current_weight_kg"])
    profile = {**data, "bmr_kcal": bmr, "tdee_kcal": tdee, "onboarded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), **targets}
    memory_agent.save_user_profile(profile)
    return {"status": "onboarded", **profile}


@app.get("/api/overview")
def get_overview():
    budget = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
    if "error" in budget:
        return budget
    water = memory_agent.get_todays_water()
    budget["consumed_water_l"] = water["consumed_water_l"]
    budget["remaining_water_l"] = round((budget.get("target_water_l") or 0) - water["consumed_water_l"], 2)
    # Long-term memory runs here automatically: every overview fetch (i.e.
    # every dashboard/chat load) re-checks recent history for patterns, so
    # the coach's context always has the freshest findings without needing
    # a separate scheduled job.
    memory_agent.detect_patterns()
    budget["patterns"] = memory_agent.get_active_patterns()["patterns"]
    return budget


@app.post("/api/log-water")
def log_water(payload: WaterLogRequest):
    memory_agent.log_water(payload.amount_l)
    return {"status": "logged", **get_overview()}


@app.get("/api/recent-meals")
def get_recent_meals():
    return memory_agent.get_todays_logs()


@app.get("/api/history")
def get_history(days: int = 14):
    """Full daily intake log: every meal, grouped by day, for the last
    `days` days (default 14) -- the browsable record of everything ever
    logged, not just today."""
    return {"days": memory_agent.get_logs_history(days)}


@app.get("/api/food-search")
def food_search(q: str, limit: int = 8):
    """Look up candidate foods for a disambiguation UI (e.g. an autocomplete
    box), filtered to the user's diet and data quality."""
    diet = memory_agent.get_user_diet()
    return {"results": rag_resolver.search_foods(q, diet=diet, limit=limit)}


@app.post("/api/log-food")
def log_food(payload: FoodLogRequest):
    diet = memory_agent.get_user_diet()
    match = rag_resolver.resolve_food(payload.item_name, diet=diet)
    if match.get("status") == "diet_mismatch":
        raise HTTPException(status_code=409, detail=f"'{payload.item_name}' doesn't fit your {match['diet']} diet.")
    if match.get("status") != "matched":
        raise HTTPException(status_code=404, detail=f"Food not found: {payload.item_name}")
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], payload.quantity, payload.unit)
    if "error" in macros:
        raise HTTPException(status_code=422, detail=macros["error"])
    memory_agent.log_meal(payload.meal_type, match["matched_food_code"], macros["food_name"], payload.quantity,
                           macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"],
                           unit=macros["unit"], serving_label=macros.get("serving_label"))
    return {"status": "logged", "matched_to": macros["food_name"], "match_confidence": match.get("confidence"), **macros, "budget": get_overview()}


@app.get("/api/suggestions")
def get_suggestions(meal_type: str | None = None, whole_day: bool = False):
    budget = get_overview()
    if "error" in budget:
        return budget
    diet = memory_agent.get_user_diet()
    if whole_day:
        return menu_planner.suggest_day_plan(
            budget["remaining_calories"], budget["remaining_protein_g"],
            budget["remaining_carbs_g"], budget["remaining_fat_g"], diet,
        )
    return menu_planner.suggest_next_meal(budget["remaining_protein_g"], budget["remaining_calories"], diet, meal_type)


@app.get("/api/patterns")
def get_patterns():
    memory_agent.detect_patterns()
    return memory_agent.get_active_patterns()


@app.get("/api/food-preferences")
def get_food_preferences(limit: int = 10):
    """Long-term memory: the foods the user actually eats most often."""
    return memory_agent.get_food_preferences(limit)


@app.get("/api/chat/history")
def chat_history():
    return {"messages": memory_agent.get_chat_history()}


@app.delete("/api/chat/history")
def clear_chat_history():
    return memory_agent.clear_chat_history()


@app.post("/api/chat")
def chat(payload: ChatRequest):
    if orchestrator.client is None:
        raise HTTPException(status_code=503, detail="AI coach is not configured. Create backend/.env and set OPENROUTER_API_KEY.")
    history = memory_agent.get_chat_history()
    memory_agent.save_chat_message("user", payload.message)
    try:
        result = orchestrator.chat_with_tools(payload.message, history)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Coach provider error: {exc}") from exc
    memory_agent.save_chat_message("assistant", result["reply"], result.get("tool_events"))
    return {"reply": result["reply"], "tool_events": result.get("tool_events", []), "overview": get_overview(), "recent_meals": memory_agent.get_todays_logs()}