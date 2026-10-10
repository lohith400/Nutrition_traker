"""NutriSync HTTP API."""
import asyncio
import json
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
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
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
    from backend import custom_foods, db_setup, energy_insights, google_fit, grocery, math_engine, memory_agent, menu_planner, orchestrator, perf, rag_resolver, reminders  # noqa: E402
except ImportError:
    import custom_foods, db_setup, energy_insights, google_fit, grocery, math_engine, memory_agent, menu_planner, orchestrator, perf, rag_resolver, reminders  # noqa: E402

@asynccontextmanager
async def lifespan(_app):
    # Ensure all tables and schema exist once at startup (no DDL on normal requests)
    try:
        db_setup.ensure_schema()
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").warning("db_setup.ensure_schema at startup: %s", exc)
    # Neither of these should delay the server becoming ready (important after a cold start):
    # the Google Fit sync runs as a background task, and the food-search index is built on a worker thread.
    async def _sync_fit():
        try:
            await google_fit.sync_today_fitness()
        except Exception as exc:
            import logging
            logging.getLogger("uvicorn.error").warning("google_fit.sync_today_fitness at startup: %s", exc)

    _app.state.fit_task = asyncio.create_task(_sync_fit())
    perf.background(rag_resolver.warm_index, "warm_index")
    # Background thread that fires food/water reminders when they are due.
    reminders.start_scheduler()
    try:
        yield
    finally:
        reminders.stop_scheduler()


app = FastAPI(title="NutriSync API", version="0.5.0", lifespan=lifespan)

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
    photo_data: str | None = None


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
    try:  # every profile save with a weight is also a weight reading for the Progress chart
        memory_agent.log_weight(float(data["current_weight_kg"]))
    except Exception:
        pass
    return {"status": "onboarded", **profile}


class PhotoPayload(BaseModel):
    photo_data: str | None = Field(default=None, max_length=5_000_000)


@app.post("/api/profile/photo")
def upload_profile_photo(payload: PhotoPayload):
    result = memory_agent.update_profile_photo(payload.photo_data)
    return {**result, "profile": memory_agent.get_user_profile()}


@app.delete("/api/profile/photo")
def delete_profile_photo():
    result = memory_agent.update_profile_photo(None)
    return {**result, "profile": memory_agent.get_user_profile()}


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
    memory_agent.maybe_detect_patterns_background()
    budget["patterns"] = memory_agent.get_active_patterns()["patterns"]
    return budget


@app.get("/api/fitness/today")
async def get_today_fitness():
    return await google_fit.sync_today_fitness()


@app.get("/api/fitness/history")
def get_fitness_history(days: int = 7):
    return {"days": google_fit.get_fitness_history(days)}


@app.post("/api/fitness/backfill")
async def backfill_fitness(days: int = 14):
    """Pull the last N days from Google Fit into daily_fitness (safe to repeat)."""
    return await google_fit.sync_range(days)


@app.get("/api/health/insights")
def health_insights(days: int = 14):
    """Deterministic energy-balance maths: intake vs burn, BMR/TDEE, pace, insights."""
    return energy_insights.build_insights(days)


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


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


@app.get("/api/reminders/push/vapid-public-key")
def get_vapid_public_key():
    return {
        "public_key": reminders.vapid_public_key(),
        "configured": reminders.vapid_configured(),
    }


@app.post("/api/reminders/push/subscribe")
def subscribe_push(payload: PushSubscribeIn, request: Request):
    if not reminders.vapid_configured():
        raise HTTPException(status_code=503, detail="VAPID keys are not configured on the server.")
    user_agent = request.headers.get("user-agent", "")
    try:
        reminders.save_subscription(
            payload.endpoint,
            payload.keys.p256dh,
            payload.keys.auth,
            user_agent=user_agent,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"status": "ok"}


@app.post("/api/reminders/push/unsubscribe")
def unsubscribe_push(payload: PushUnsubscribeIn):
    reminders.delete_subscription(payload.endpoint)
    return {"status": "ok"}


@app.post("/api/reminders/test-push")
def test_push_notification():
    if not reminders.vapid_configured():
        raise HTTPException(status_code=400, detail="VAPID keys are not configured on the server.")
    subs = reminders.list_subscriptions()
    if not subs:
        raise HTTPException(status_code=400, detail="No devices are subscribed to push notifications.")

    payload = {
        "title": "NutriSync Test",
        "body": "Web push notifications are working!",
        "url": "/reminders",
        "tag": "nutrisync-test",
    }
    success_count = 0
    errors = []
    for sub in subs:
        ok, err = reminders.send_web_push(sub, payload)
        if ok:
            success_count += 1
        elif err:
            errors.append(err)

    if success_count == 0:
        raise HTTPException(
            status_code=502,
            detail="Failed to deliver push notification: " + ("; ".join(errors) if errors else "all deliveries failed"),
        )
    return {"status": "sent", "devices": success_count}


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
    status = reminders.channel_status()
    has_push = status["push"] and status.get("push_devices", 0) > 0
    has_email = status["email"]
    if not (has_push or has_email):
        raise HTTPException(
            status_code=400,
            detail="No notification channel is ready. Enable phone notifications or configure SMTP email in backend/.env.",
        )
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
    return {"results": rag_resolver.find_candidates(q, diet=diet, limit=min(max(limit, 1), 30))}


@app.get("/api/food-options")
def food_options(q: str, limit: int = 8):
    """Related foods for a typed name, each with per-serving and per-100g nutrition, so the user can choose
    which one they mean before anything is logged (dataset, built-in reference staples and own custom foods)."""
    diet = memory_agent.get_user_diet()
    options = rag_resolver.find_candidates(q, diet=diet, limit=min(max(limit, 1), 30))
    return {"query": q, "options": options, "exact_count": sum(1 for o in options if o.get("exact")),
            "hidden_by_diet": rag_resolver.count_hidden_by_diet(q, diet), "diet": diet}


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


def _chat_inputs(payload: ChatRequest):
    """Validate a chat request. Returns (text, image, text_to_save_in_history)."""
    if orchestrator.client is None:
        raise HTTPException(status_code=503, detail="AI coach is not configured. Create backend/.env and set ONE of OPENROUTER_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY.")
    text = (payload.message or "").strip()
    image = payload.image
    if image and not image.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
        raise HTTPException(status_code=422, detail="Unsupported image. Please upload a JPG, PNG or WebP photo.")
    if not text and not image:
        raise HTTPException(status_code=422, detail="Send a message or a meal photo.")
    # The photo itself is not stored in chat history (keeps the database small);
    # a marker is saved so the transcript still shows a photo was sent.
    return text, image, (f"📷 [Meal photo] {text}".strip() if image else text)


def _chat_prepare(saved: str):
    """Load the transcript and the live context at the same time, then store the user's message
    while the model is thinking (it is joined before the reply is stored, so order is preserved)."""
    # The last N turns (default 20, across days) are loaded from the database on every request,
    # so the coach keeps its context after refreshes, restarts and at midnight.
    history, context = perf.parallel(lambda: memory_agent.get_recent_history(limit=CHAT_CONTEXT_MESSAGES), orchestrator._context)
    return history, context, perf.submit(lambda: memory_agent.save_chat_message("user", saved))


def _chat_finish(reply: str, tool_events: list, saved_user) -> dict:
    """Store the reply and build the screen refresh data (all three reads/writes run together)."""
    saved_user.result()
    _, overview, meals = perf.parallel(
        lambda: memory_agent.save_chat_message("assistant", reply, tool_events),
        get_overview,
        memory_agent.get_todays_logs,
    )
    return {"reply": reply, "tool_events": tool_events, "overview": overview, "recent_meals": meals}


@app.post("/api/chat")
def chat(payload: ChatRequest):
    text, image, saved = _chat_inputs(payload)
    history, context, saved_user = _chat_prepare(saved)
    try:
        result = orchestrator.chat_with_tools(text, history, image=image, location=payload.location, context=context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Coach provider error: {exc}") from exc
    return _chat_finish(result["reply"], result.get("tool_events", []), saved_user)


def _ndjson(event: dict) -> bytes:
    return (json.dumps(event, default=str) + "\n").encode("utf-8")


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest):
    """Same coach as /api/chat, but the answer is streamed as newline-delimited JSON events so the
    screen fills in while the model is still writing:  start -> (tool_start/tool_end)* -> delta* -> done.
    On a failure mid-way an {"type": "error"} event is sent. /api/chat stays available as the plain fallback."""
    text, image, saved = _chat_inputs(payload)  # bad requests still get a normal 4xx before streaming starts

    def events():
        yield _ndjson({"type": "start"})
        try:
            history, context, saved_user = _chat_prepare(saved)
            final = None
            for ev in orchestrator.chat_with_tools_stream(text, history, image=image, location=payload.location, context=context):
                if ev["type"] == "final":
                    final = ev
                else:
                    yield _ndjson(ev)
            if final is None:
                raise RuntimeError("the coach returned no reply")
            yield _ndjson({"type": "done", **_chat_finish(final["reply"], final["tool_events"], saved_user)})
        except Exception as exc:  # noqa: BLE001
            yield _ndjson({"type": "error", "detail": f"Coach provider error: {exc}"})

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Logging by exact food (the user picked it from the options), editing, deleting
# ---------------------------------------------------------------------------
class FoodCodeLogRequest(BaseModel):
    food_code: str = Field(min_length=1, max_length=80)
    quantity: float = Field(default=1.0, gt=0, le=2000)
    unit: Literal["serving", "grams"] = "serving"
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = "snack"
    date: str | None = None          # YYYY-MM-DD, for logging something you forgot earlier
    from_chat: bool = False          # also leave a note in today's coach conversation


def _valid_log_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Date must look like 2026-10-05.")
    today = datetime.now().date()
    if day > today:
        raise HTTPException(status_code=422, detail="You can't log food for a future day.")
    if (today - day).days > 400:
        raise HTTPException(status_code=422, detail="That date is too far back.")
    return day.strftime("%Y-%m-%d")


@app.post("/api/log-food-code")
def log_food_code(payload: FoodCodeLogRequest):
    log_date = _valid_log_date(payload.date)
    macros = math_engine.calculate_meal_macros(payload.food_code, payload.quantity, payload.unit)
    if "error" in macros:
        raise HTTPException(status_code=422, detail=macros["error"])
    saved = memory_agent.log_meal(payload.meal_type, payload.food_code, macros["food_name"], payload.quantity,
                                  macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"],
                                  unit=macros["unit"], serving_label=macros.get("serving_label"), log_date=log_date)
    memory_agent.maybe_detect_patterns(force=True)
    amount = f"{payload.quantity:g} g" if payload.unit == "grams" else f"{payload.quantity:g} x {macros.get('serving_label') or 'serving'}"
    result = {"status": "logged", "log_id": saved.get("log_id"), "date": saved.get("date"), "matched_to": macros["food_name"],
              "meal_type": payload.meal_type, "amount": amount, **macros}
    if payload.from_chat and not log_date:
        memory_agent.save_chat_message("user", f"I had {amount} of {macros['food_name']} ({payload.meal_type}).")
        memory_agent.save_chat_message(
            "assistant",
            f"Logged {macros['food_name']} ({amount}) as {payload.meal_type}: {macros['calories']} kcal, {macros['protein_g']}g protein.",
            [{"tool": "log_food", "args": {"item_name": macros["food_name"], "quantity": payload.quantity, "unit": payload.unit}, "result": result}],
        )
    return {**result, "budget": get_overview()}


class LogPatch(BaseModel):
    quantity: float | None = Field(default=None, gt=0, le=2000)
    unit: Literal["serving", "grams"] | None = None
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = None


@app.patch("/api/log/{log_id}")
def edit_log(log_id: int, payload: LogPatch):
    row = memory_agent.get_log(log_id)
    if not row:
        raise HTTPException(status_code=404, detail="That entry no longer exists.")
    meal_type = payload.meal_type or row["meal_type"]
    quantity = payload.quantity if payload.quantity is not None else row["quantity"]
    unit = payload.unit or row.get("unit") or "serving"
    if payload.quantity is None and payload.unit is None:
        macros = {"calories": row["calories"], "protein_g": row["protein_g"], "carbs_g": row["carbs_g"], "fat_g": row["fat_g"], "serving_label": row.get("serving_label")}
    else:
        if not row.get("food_code"):
            raise HTTPException(status_code=422, detail="This old entry has no food code, so only its meal can be changed.")
        macros = math_engine.calculate_meal_macros(row["food_code"], quantity, unit)
        if "error" in macros:
            raise HTTPException(status_code=422, detail=macros["error"])
    memory_agent.update_log(log_id, meal_type, quantity, unit, macros.get("serving_label"), macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"])
    memory_agent.maybe_detect_patterns(force=True)
    return {"status": "updated", "log": memory_agent.get_log(log_id)}


@app.delete("/api/log/{log_id}")
def remove_log(log_id: int):
    if not memory_agent.delete_log(log_id):
        raise HTTPException(status_code=404, detail="That entry no longer exists.")
    memory_agent.maybe_detect_patterns(force=True)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Weight tracking
# ---------------------------------------------------------------------------
class WeightIn(BaseModel):
    weight_kg: float = Field(gt=25, lt=300)
    date: str | None = None
    note: str | None = Field(default=None, max_length=200)


@app.get("/api/weight")
def get_weight(days: int = 120):
    return {"entries": memory_agent.get_weights(min(max(days, 1), 800))}


@app.post("/api/weight")
def add_weight(payload: WeightIn):
    day = _valid_log_date(payload.date)
    memory_agent.log_weight(payload.weight_kg, day, payload.note)
    return {"status": "logged", "entries": memory_agent.get_weights(120)}


@app.delete("/api/weight/{log_date}")
def remove_weight(log_date: str):
    if not memory_agent.delete_weight(log_date):
        raise HTTPException(status_code=404, detail="No reading on that day.")
    return {"status": "deleted", "entries": memory_agent.get_weights(120)}


# ---------------------------------------------------------------------------
# Custom foods (built from ingredients)
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    name: str = Field(default="My recipe", max_length=80)
    servings: float = Field(default=1, gt=0, le=100)
    ingredients: list[dict] = Field(min_length=1, max_length=custom_foods.MAX_INGREDIENTS)
    use_ai: bool = True


class CustomFoodIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    servings: float = Field(default=1, gt=0, le=100)
    serving_label: str = Field(default="serving", max_length=30)
    notes: str = Field(default="", max_length=500)
    ingredients: list[dict] = Field(min_length=1, max_length=custom_foods.MAX_INGREDIENTS)


@app.get("/api/custom-foods")
def list_custom_foods():
    return {"foods": custom_foods.list_foods(), "ai_available": orchestrator.client is not None}


@app.post("/api/custom-foods/analyze")
def analyze_custom_food(payload: AnalyzeRequest):
    return custom_foods.analyze(payload.name, payload.servings, payload.ingredients, use_ai=payload.use_ai)


@app.post("/api/custom-foods")
def create_custom_food(payload: CustomFoodIn):
    result = custom_foods.save(payload.name, payload.servings, payload.serving_label, payload.notes, payload.ingredients)
    if result.get("status") != "saved":
        raise HTTPException(status_code=409 if result.get("conflict") else 422, detail=result.get("error", "Could not save."))
    return result


@app.put("/api/custom-foods/{food_id}")
def update_custom_food(food_id: int, payload: CustomFoodIn):
    if not custom_foods.get_food(food_id):
        raise HTTPException(status_code=404, detail="Custom food not found.")
    result = custom_foods.save(payload.name, payload.servings, payload.serving_label, payload.notes, payload.ingredients, food_id=food_id)
    if result.get("status") != "saved":
        raise HTTPException(status_code=409 if result.get("conflict") else 422, detail=result.get("error", "Could not save."))
    return result


@app.delete("/api/custom-foods/{food_id}")
def delete_custom_food(food_id: int):
    if not custom_foods.delete(food_id):
        raise HTTPException(status_code=404, detail="Custom food not found.")
    return {"status": "deleted", "foods": custom_foods.list_foods()}


@app.get("/api/grocery/nutrition")
def grocery_nutrition():
    """What the pantry is worth: per-item nutrition (raw values where known) and a total for items measured by weight/volume."""
    return grocery.nutrition_overview()


# ---------------------------------------------------------------------------
# Micronutrients & Vitamins (ICMR-NIN 2020 RDA)
# ---------------------------------------------------------------------------
NUTRIENT_METADATA = {
    "fibre_g": {"name": "Dietary Fibre", "category": "macro", "unit": "g"},
    "calcium_mg": {"name": "Calcium", "category": "mineral", "unit": "mg"},
    "magnesium_mg": {"name": "Magnesium", "category": "mineral", "unit": "mg"},
    "sodium_mg": {"name": "Sodium", "category": "mineral", "unit": "mg"},
    "potassium_mg": {"name": "Potassium", "category": "mineral", "unit": "mg"},
    "iron_mg": {"name": "Iron", "category": "mineral", "unit": "mg"},
    "copper_mg": {"name": "Copper", "category": "mineral", "unit": "mg"},
    "zinc_mg": {"name": "Zinc", "category": "mineral", "unit": "mg"},
    "vita_ug": {"name": "Vitamin A", "category": "vitamin", "unit": "µg"},
    "vite_mg": {"name": "Vitamin E", "category": "vitamin", "unit": "mg"},
    "vitd_ug": {"name": "Vitamin D", "category": "vitamin", "unit": "µg"},
    "vitk_ug": {"name": "Vitamin K", "category": "vitamin", "unit": "µg"},
    "folate_ug": {"name": "Folate (B9)", "category": "vitamin", "unit": "µg"},
    "vitb1_mg": {"name": "Thiamine (B1)", "category": "vitamin", "unit": "mg"},
    "vitb2_mg": {"name": "Riboflavin (B2)", "category": "vitamin", "unit": "mg"},
    "vitb3_mg": {"name": "Niacin (B3)", "category": "vitamin", "unit": "mg"},
    "vitb5_mg": {"name": "Pantothenic Acid (B5)", "category": "vitamin", "unit": "mg"},
    "vitb6_mg": {"name": "Vitamin B6", "category": "vitamin", "unit": "mg"},
    "vitb7_ug": {"name": "Biotin (B7)", "category": "vitamin", "unit": "µg"},
    "vitc_mg": {"name": "Vitamin C", "category": "vitamin", "unit": "mg"},
}


def _compute_day_micronutrients(day: str):
    conn = memory_agent._get_conn()
    try:
        user_row = conn.execute("SELECT sex FROM user_profile WHERE id = 1").fetchone()
        sex = "female" if user_row and user_row["sex"] and str(user_row["sex"]).lower() in ("f", "female") else "male"
        logs = conn.execute(
            "SELECT food_code, food_name, quantity, COALESCE(unit, 'serving') as unit FROM daily_logs WHERE log_date = ?",
            (day,)
        ).fetchall()
    finally:
        conn.close()

    rdas = math_engine.ICMR_NIN_2020_RDA.get(sex, math_engine.ICMR_NIN_2020_RDA["male"])

    totals = {k: 0.0 for k in NUTRIENT_METADATA}
    food_contributions = {k: [] for k in NUTRIENT_METADATA}
    foods_with_data_count = 0

    for log in logs:
        code = log["food_code"]
        qty = log["quantity"]
        unit = log["unit"]
        if not code:
            continue
        macros = math_engine.calculate_meal_macros(code, qty, unit)
        if "error" in macros:
            continue

        had_data = False
        # Fibre
        if macros.get("fibre_g") is not None:
            had_data = True
            fib = float(macros["fibre_g"])
            totals["fibre_g"] += fib
            food_contributions["fibre_g"].append({"food_name": macros["food_name"], "amount": fib})

        # Micros
        micros = macros.get("micros")
        if micros and isinstance(micros, dict):
            for k, val in micros.items():
                if val is not None and k in totals:
                    had_data = True
                    amt = float(val)
                    totals[k] += amt
                    food_contributions[k].append({"food_name": macros["food_name"], "amount": amt})

        if had_data:
            foods_with_data_count += 1

    nutrients = []
    has_logs = len(logs) > 0
    has_data = foods_with_data_count > 0

    for key, meta in NUTRIENT_METADATA.items():
        rda = rdas.get(key)
        tot = round(totals[key], 1) if has_data else (0.0 if has_logs else None)
        pct = round((tot / rda) * 100, 1) if (tot is not None and rda and rda > 0) else None

        # Sort top contributors
        contribs = sorted(food_contributions[key], key=lambda x: x["amount"], reverse=True)
        top = contribs[:3]

        if tot is None:
            status = "unknown"
        elif pct is not None and pct >= 100:
            status = "optimal"
        elif pct is not None and pct >= 70:
            status = "moderate"
        else:
            status = "low"

        nutrients.append({
            "key": key,
            "name": meta["name"],
            "category": meta["category"],
            "unit": meta["unit"],
            "amount": tot,
            "rda": rda,
            "pct_rda": pct,
            "status": status,
            "top_foods": top,
        })

    return {
        "date": day,
        "sex": sex,
        "has_data": has_data,
        "logs_count": len(logs),
        "totals": {k: round(v, 1) for k, v in totals.items()} if has_data else {},
        "rdas": rdas,
        "nutrients": nutrients,
    }


@app.get("/api/micronutrients/today")
def get_today_micronutrients():
    today = datetime.now().strftime("%Y-%m-%d")
    return _compute_day_micronutrients(today)


@app.get("/api/micronutrients")
def get_micronutrients(date: str | None = None):
    day = _valid_log_date(date) or datetime.now().strftime("%Y-%m-%d")
    return _compute_day_micronutrients(day)

