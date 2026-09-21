"""NutriSync HTTP API."""
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import math_engine  # noqa: E402
import memory_agent  # noqa: E402
import menu_planner  # noqa: E402
import orchestrator  # noqa: E402
import rag_resolver  # noqa: E402

app = FastAPI(title="NutriSync API", version="0.3.0")
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
    allergies: str = ""
    medical_conditions: str = ""
    sleep_schedule: str = ""

class FoodLogRequest(BaseModel):
    item_name: str = Field(min_length=1)
    quantity: float = Field(default=1.0, gt=0, le=100)
    meal_type: str = "snack"

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

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
    return math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))

@app.get("/api/recent-meals")
def get_recent_meals():
    return memory_agent.get_todays_logs()

@app.post("/api/log-food")
def log_food(payload: FoodLogRequest):
    match = rag_resolver.resolve_food(payload.item_name)
    if match.get("status") != "matched":
        raise HTTPException(status_code=404, detail=f"Food not found: {payload.item_name}")
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], payload.quantity)
    if "error" in macros:
        raise HTTPException(status_code=422, detail=macros["error"])
    memory_agent.log_meal(payload.meal_type, match["matched_food_code"], macros["food_name"], payload.quantity, macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"])
    return {"status": "logged", "matched_to": macros["food_name"], "match_confidence": match.get("confidence"), **macros, "budget": get_overview()}

@app.get("/api/suggestions")
def get_suggestions():
    budget = get_overview()
    if "error" in budget:
        return budget
    return menu_planner.suggest_next_meal(budget["remaining_protein_g"], budget["remaining_calories"])

@app.get("/api/patterns")
def get_patterns():
    memory_agent.detect_patterns()
    return memory_agent.get_active_patterns()

@app.post("/api/chat")
def chat(payload: ChatRequest):
    if orchestrator.client is None:
        raise HTTPException(status_code=503, detail="AI coach is not configured. Create backend/.env and set OPENROUTER_API_KEY.")
    try:
        return {"reply": orchestrator.interact(payload.message)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Coach provider error: {exc}") from exc
