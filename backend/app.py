"""NutriSync HTTP API."""
import os

if os.name == "nt":
    os.environ.pop("TZ", None)

import secrets
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

DIR = Path(__file__).resolve().parent
ROOT = DIR.parent
load_dotenv(DIR / ".env")
load_dotenv(ROOT / ".env")

if os.name == "nt":
    os.environ.pop("TZ", None)

for p in (DIR, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from backend import db_setup, grocery, math_engine, memory_agent, menu_planner, orchestrator, rag_resolver, reminders  # noqa: E402
except ImportError:
    import db_setup, grocery, math_engine, memory_agent, menu_planner, orchestrator, rag_resolver, reminders  # noqa: E402

@asynccontextmanager
async def lifespan(_app):
    # Ensure all tables and schema exist once at startup (no DDL on normal requests)
    try:
        db_setup.ensure_schema()
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").warning("db_setup.ensure_schema at startup: %s", exc)
    # Background thread that fires food/water reminders when they are due.
    reminders.start_scheduler()
    try:
        yield
    finally:
        reminders.stop_scheduler()


app = FastAPI(title="NutriSync API", version="0.4.0", lifespan=lifespan)

# --- Optional access key -------------------------------------------------------------
# A free public deployment has a public URL. Set ACCESS_KEY on the server and only
# requests that send the same value in the X-Access-Key header can use /api/*.
# Unset (the default on localhost) = open, exactly like before.
ACCESS_KEY = (os.getenv("ACCESS_KEY") or "").strip()


@app.middleware("http")
async def require_access_key(request, call_next):
    if ACCESS_KEY and request.url.path.startswith("/api") and request.method != "OPTIONS":
        if not secrets.compare_digest(request.headers.get("x-access-key", ""), ACCESS_KEY):
            return JSONResponse({"detail": "Access key required."}, status_code=401)
    return await call_next(request)


# --- CORS (added AFTER the auth middleware so it is the outermost layer and CORS headers
# are present even on 401 responses and preflight requests) ---------------------------
# CORS_ORIGINS      comma-separated exact origins, e.g. https://nutrisync.vercel.app,http://localhost:3000
# CORS_ORIGIN_REGEX optional pattern, e.g. https://.*\.vercel\.app  (also covers Vercel preview URLs)
origins = [x.strip().rstrip("/") for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()]
origin_regex = (os.getenv("CORS_ORIGIN_REGEX") or r"https://.*\.vercel\.app").strip() or None
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


CHAT_CONTEXT_MESSAGES = int(os.getenv("CHAT_CONTEXT_MESSAGES", "20") or 20)


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
    target_water_l: float | None = None


class FoodLogRequest(BaseModel):
    item_name: str = Field(min_length=1)
    quantity: float = Field(default=1.0, gt=0, le=2000)
    unit: Literal["serving", "grams"] = "serving"
    meal_type: str = "snack"


class ChatRequest(BaseModel):
    message: str = Field(default="", max_length=4000)
    # Optional meal photo as a data URL (data:image/jpeg;base64,...), resized by the frontend.
    image: str | None = Field(default=None, max_length=8_000_000)
    # Optional device location, used only by the restaurant finder.
    location: dict | None = None


class WaterLogRequest(BaseModel):
    amount_l: float = Field(gt=0, le=5)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "NutriSync API",
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@app.get("/api/profile")
def get_profile():
    return memory_agent.get_user_profile()


@app.post("/api/profile/onboarding")
def save_onboarding(payload: OnboardingRequest):
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    bmr, tdee = math_engine.calculate_bmr_tdee(data["age"], data["sex"], data["height_cm"], data["current_weight_kg"], data["activity_level"])
    targets = math_engine.calculate_targets(tdee, data["goal"], data["current_weight_kg"])
    if data.get("target_water_l") is not None and float(data["target_water_l"]) > 0:
        targets["target_water_l"] = float(data["target_water_l"])
    else:
        existing = memory_agent.get_user_profile()
        if existing and existing.get("target_water_l") and float(existing["target_water_l"]) > 0:
            targets["target_water_l"] = float(existing["target_water_l"])
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
    # Long-term memory runs here automatically: at most once every 10 minutes,
    # so the coach's context has fresh findings without creating DB write contention.
    memory_agent.maybe_detect_patterns(force=False)
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


class ReminderIn(BaseModel):
    kind: Literal["food", "water"]
    time: str
    repeat: Literal["daily", "once"] = "daily"
    food_name: str | None = None
    quantity: float = 1
    unit: str = "serving"
    meal_type: str | None = None
    water_ml: float | None = None
    auto_log: bool = True


class ReminderPatch(BaseModel):
    enabled: bool


@app.get("/api/reminders")
def get_reminders():
    return {"reminders": reminders.list_reminders(), "channels": reminders.channel_status()}


@app.post("/api/reminders")
def add_reminder(payload: ReminderIn):
    result = reminders.create_reminder(
        payload.kind, payload.time, payload.repeat, payload.food_name, payload.quantity,
        payload.unit, payload.meal_type, payload.water_ml, payload.auto_log,
    )
    if result.get("status") != "created":
        raise HTTPException(status_code=422, detail=result.get("error", "Could not save the reminder."))
    return result


@app.post("/api/reminders/test-notification")
def test_reminder_notification():
    if not (reminders.channel_status()["ntfy"] or reminders.channel_status()["email"]):
        raise HTTPException(status_code=400, detail="No phone or email channel is set up yet. Add NTFY_TOPIC (phone) or the SMTP settings to backend/.env and restart the backend.")
    result = reminders.send_notifications("NutriSync test", "Notifications are working. Your reminders will reach you here.")
    if not result["sent"]:
        raise HTTPException(status_code=502, detail="Sending failed: " + "; ".join(f"{k}: {v}" for k, v in result["errors"].items()))
    return result


@app.get("/api/reminders/events")
def reminder_events(since_id: int = 0, limit: int = 30):
    """Recent fired reminders. The website polls this to show a toast while a tab is open."""
    return {"events": reminders.list_events(since_id, min(max(limit, 1), 100))}


@app.patch("/api/reminders/{reminder_id}")
def toggle_reminder(reminder_id: int, payload: ReminderPatch):
    if not reminders.set_enabled(reminder_id, payload.enabled):
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return {"status": "ok"}


@app.delete("/api/reminders/{reminder_id}")
def delete_reminder(reminder_id: int):
    if not reminders.delete_reminder(reminder_id):
        raise HTTPException(status_code=404, detail="Reminder not found.")
    return {"status": "deleted"}


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
    memory_agent.maybe_detect_patterns(force=True)
    return {"status": "logged", "matched_to": macros["food_name"], "match_confidence": match.get("confidence"), **macros, "budget": get_overview()}


@app.get("/api/suggestions")
def get_suggestions(meal_type: str | None = None, whole_day: bool = False, refresh: bool = False):
    budget = get_overview()
    if "error" in budget:
        return budget
    diet = memory_agent.get_user_diet()
    if whole_day:
        return menu_planner.suggest_day_plan(
            budget["remaining_calories"], budget["remaining_protein_g"],
            budget["remaining_carbs_g"], budget["remaining_fat_g"], diet,
            randomize=True,
        )
    return menu_planner.suggest_next_meal(
        budget["remaining_protein_g"], budget["remaining_calories"], diet, meal_type,
        randomize=refresh,
    )


@app.get("/api/patterns")
def get_patterns():
    return memory_agent.get_active_patterns()


@app.get("/api/food-preferences")
def get_food_preferences(limit: int = 10):
    """Long-term memory: the foods the user actually eats most often."""
    return memory_agent.get_food_preferences(limit)


class GroceryItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    quantity: float = Field(default=1, gt=0, le=100000)
    unit: str = Field(default="pcs", max_length=20)


class GroceryItemPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    quantity: float | None = Field(default=None, le=100000)
    unit: str | None = Field(default=None, max_length=20)


@app.get("/api/grocery")
def get_grocery():
    return {"items": grocery.list_items(), "units": grocery.UNITS}


@app.post("/api/grocery")
def add_grocery(payload: GroceryItemIn):
    result = grocery.add_item(payload.name, payload.quantity, payload.unit)
    if result.get("status") != "ok":
        raise HTTPException(status_code=422, detail=result.get("error", "Could not add item."))
    return {**result, "items": grocery.list_items()}


@app.patch("/api/grocery/{item_id}")
def update_grocery(item_id: int, payload: GroceryItemPatch):
    result = grocery.update_item(item_id, payload.quantity, payload.unit, payload.name)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("error", "Item not found."))
    return {**result, "items": grocery.list_items()}


@app.delete("/api/grocery/{item_id}")
def delete_grocery(item_id: int):
    result = grocery.delete_item(item_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("error", "Item not found."))
    return {**result, "items": grocery.list_items()}


@app.get("/api/chat/days")
def chat_days():
    """Days that have a coach conversation (one chat page per day)."""
    return {"today": datetime.now().strftime("%Y-%m-%d"), "days": memory_agent.list_chat_days()}


@app.get("/api/chat/history")
def chat_history(date: str | None = None):
    """The conversation for one day (defaults to today)."""
    day = date or datetime.now().strftime("%Y-%m-%d")
    return {"date": day, "messages": memory_agent.get_chat_history(date=day)}


@app.delete("/api/chat/history")
def clear_chat_history(date: str | None = None):
    """Clear one day's conversation (defaults to today)."""
    return memory_agent.clear_chat_history(date or datetime.now().strftime("%Y-%m-%d"))


@app.post("/api/chat")
def chat(payload: ChatRequest):
    if orchestrator.client is None:
        raise HTTPException(status_code=503, detail="AI coach is not configured. Create backend/.env and set ONE of OPENROUTER_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY.")
    # The last N turns (default 20, across days) are loaded from the database on every request,
    # so the coach keeps its context after refreshes, restarts and at midnight.
    history = memory_agent.get_recent_history(limit=CHAT_CONTEXT_MESSAGES)
    text = (payload.message or "").strip()
    image = payload.image
    if image and not image.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
        raise HTTPException(status_code=422, detail="Unsupported image. Please upload a JPG, PNG or WebP photo.")
    if not text and not image:
        raise HTTPException(status_code=422, detail="Send a message or a meal photo.")
    # The photo itself is not stored in chat history (keeps the database small);
    # a marker is saved so the transcript still shows a photo was sent.
    saved = f"📷 [Meal photo] {text}".strip() if image else text
    memory_agent.save_chat_message("user", saved)
    try:
        result = orchestrator.chat_with_tools(text, history, image=image, location=payload.location)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Coach provider error: {exc}") from exc
    memory_agent.save_chat_message("assistant", result["reply"], result.get("tool_events"))
    return {"reply": result["reply"], "tool_events": result.get("tool_events", []), "overview": get_overview(), "recent_meals": memory_agent.get_todays_logs()}