"""NutriSync coach service used by both the CLI and FastAPI.

The API key is deliberately read from the environment. The deterministic
nutrition modules remain the source of truth for all numbers.
"""
import json
import os
from datetime import datetime

from openai import OpenAI

try:
    from backend import math_engine, memory_agent, menu_planner, rag_resolver
except ImportError:
    import math_engine, memory_agent, menu_planner, rag_resolver

MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
API_KEY = os.getenv("OPENROUTER_API_KEY")
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=API_KEY) if API_KEY else None


def tool_save_onboarding(name, age, sex, height_cm, current_weight_kg, target_weight_kg, goal, activity_level, allergies="", medical_conditions="", sleep_schedule=""):
    bmr, tdee = math_engine.calculate_bmr_tdee(age, sex, height_cm, current_weight_kg, activity_level)
    targets = math_engine.calculate_targets(tdee, goal, current_weight_kg)
    profile = {
        "name": name, "age": age, "sex": sex, "height_cm": height_cm,
        "current_weight_kg": current_weight_kg, "target_weight_kg": target_weight_kg,
        "goal": goal, "activity_level": activity_level, "allergies": allergies,
        "medical_conditions": medical_conditions, "sleep_schedule": sleep_schedule,
        "bmr_kcal": bmr, "tdee_kcal": tdee,
        "onboarded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), **targets,
    }
    memory_agent.save_user_profile(profile)
    return {"status": "onboarded", **profile}


def tool_log_food_item(item_name, quantity, meal_type):
    match = rag_resolver.resolve_food(item_name)
    if match.get("status") != "matched":
        return {"status": "not_found", "item": item_name}
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity)
    if "error" in macros:
        return macros
    memory_agent.log_meal(meal_type, match["matched_food_code"], macros["food_name"], quantity, macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"])
    return {"status": "logged", "matched_to": macros["food_name"], "match_confidence": match.get("confidence"), **macros}


def _context():
    today = datetime.now().strftime("%Y-%m-%d")
    profile = memory_agent.get_user_profile()
    budget = math_engine.get_remaining_budget_today(today)
    meals = memory_agent.get_todays_logs()
    # Long-term memory: re-check for behavioural patterns (e.g. recurring
    # low breakfast protein) on every turn and hand any findings to the
    # model, so the coach can proactively mention them instead of only
    # reacting to what's asked.
    memory_agent.detect_patterns()
    patterns = memory_agent.get_active_patterns()["patterns"]
    return {"profile": profile, "budget": budget, "meals": meals, "detected_patterns": patterns}


def interact(user_message: str) -> str:
    """Answer a coach question using live profile, budget, and meal context.

    Kept for backward compatibility with any caller that only wants a plain
    text reply with no tool-calling. The chat endpoint now uses
    `chat_with_tools` instead, which can actually look up and log food.
    """
    if client is None:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")
    context = _context()
    system = (
        "You are NutriSync India, a concise and supportive nutrition coach. "
        "Use only nutrition numbers present in the supplied context; never invent them. "
        "Do not diagnose medical conditions. Encourage professional advice for medical questions. "
        f"Live context:\n{json.dumps(context, default=str)}"
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user_message}],
        temperature=0.3,
    )
    return response.choices[0].message.content or "I could not generate a response right now."


# ---------------------------------------------------------------------------
# Conversational tool-calling coach
# ---------------------------------------------------------------------------
# This is what actually powers the chat page: the model is given tools that
# wrap the RAG resolver, math engine, and memory agent (the same modules the
# CLI/API food-logging path uses), and it decides when to call them. The
# model NEVER invents a calorie/macro number -- every number the user sees
# came out of `lookup_food`/`log_food`, which call rag_resolver + math_engine
# directly. The model's only job is conversation and deciding intent
# (what food, how much, which meal, and whether the user actually confirmed).

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_food",
            "description": (
                "Resolve a colloquial Indian food name against the nutrition database "
                "(RAG match + exact macro lookup) for a given quantity, WITHOUT logging "
                "it yet. Always call this first whenever the user mentions eating or "
                "drinking something, before you say any numbers or ask to log it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "Food name as the user said it, e.g. 'idli', 'thatte idli', 'chai'."},
                    "quantity": {"type": "number", "description": "Number of servings, e.g. 1, 2, 0.5. Default to 1 if the user didn't say."},
                },
                "required": ["item_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_food",
            "description": (
                "Persist a food item to today's log. Only call this AFTER the user has "
                "explicitly confirmed (e.g. 'yes', 'log it', 'add it to lunch') following "
                "a prior lookup_food call in this conversation. Never call this on the "
                "first mention of a food."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string"},
                    "quantity": {"type": "number"},
                    "meal_type": {
                        "type": "string",
                        "enum": ["breakfast", "lunch", "dinner", "snack"],
                        "description": "Defaults to 'snack' if the user hasn't said which meal.",
                    },
                },
                "required": ["item_name", "quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_today_summary",
            "description": "Get the user's remaining calorie/macro budget and everything logged so far today.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def _tool_lookup_food(item_name, quantity=1):
    match = rag_resolver.resolve_food(item_name)
    if match.get("status") != "matched":
        return {"status": "not_found", "item": item_name}
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity)
    if "error" in macros:
        return macros
    return {"status": "found", "match_confidence": match.get("confidence"), "match_method": match.get("match_method"), **macros}


TOOL_IMPL = {
    "lookup_food": lambda args: _tool_lookup_food(args.get("item_name", ""), args.get("quantity", 1) or 1),
    "log_food": lambda args: tool_log_food_item(args.get("item_name", ""), args.get("quantity", 1) or 1, args.get("meal_type") or "snack"),
    "get_today_summary": lambda args: _context(),
}

MAX_TOOL_ROUNDS = 5


def chat_with_tools(user_message: str, history: list | None = None) -> dict:
    """Runs a bounded tool-calling loop against OpenRouter.

    `history` is the prior turns as stored by memory_agent.get_chat_history()
    (role/content dicts). Returns {"reply": str, "tool_events": [...]}, where
    tool_events records every tool call + result made during this turn so the
    frontend can render a "found in database" / "logged" card inline.
    """
    if client is None:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    context = _context()
    system = (
        "You are NutriSync India, a warm, concise Indian nutrition coach chatting inline in an app.\n"
        "Whenever the user mentions eating or drinking something, ALWAYS call lookup_food first to get "
        "its real calories/protein/carbs/fat -- never guess or estimate nutrition numbers yourself.\n"
        "After lookup_food returns a match, tell the user the matched food name, quantity, calories, "
        "protein, carbs and fat, then ask if they'd like it logged to today's meals and as which meal "
        "(breakfast/lunch/dinner/snack). Only call log_food once the user has clearly confirmed.\n"
        "If lookup_food returns not_found, say so plainly, don't invent numbers, and ask them to rephrase "
        "or try a simpler/more common name.\n"
        "If detected_patterns in the context is non-empty, weave a brief, supportive mention of the "
        "most relevant one into your reply where it fits naturally (e.g. noticing low breakfast protein) "
        "-- don't force it into every message.\n"
        "Keep replies short (2-4 sentences) and conversational. Do not diagnose medical conditions; "
        "suggest professional advice for medical questions.\n"
        f"Live context (profile, remaining budget, meals already logged today, detected long-term patterns):\n{json.dumps(context, default=str)}"
    )

    messages = [{"role": "system", "content": system}]
    for turn in (history or []):
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})

    tool_events = []
    for _ in range(MAX_TOOL_ROUNDS):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return {"reply": msg.content or "I could not generate a response right now.", "tool_events": tool_events}

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            impl = TOOL_IMPL.get(name)
            result = impl(args) if impl else {"error": f"unknown tool '{name}'"}
            tool_events.append({"tool": name, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)})

    return {
        "reply": "I ran into trouble figuring that out -- could you rephrase what you ate?",
        "tool_events": tool_events,
    }


# Kept for callers that used these names in the original CLI implementation.
def tool_get_remaining_budget():
    return math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))


def tool_get_todays_log():
    return memory_agent.get_todays_logs()


def tool_check_patterns():
    memory_agent.detect_patterns()
    return memory_agent.get_active_patterns()


def tool_suggest_meal():
    budget = tool_get_remaining_budget()
    if "error" in budget:
        return budget
    return menu_planner.suggest_next_meal(budget["remaining_protein_g"], budget["remaining_calories"])


def tool_get_profile():
    return memory_agent.get_user_profile()