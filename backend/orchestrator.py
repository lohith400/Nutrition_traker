"""NutriSync coach service used by both the CLI and FastAPI.

The API key is deliberately read from the environment. The deterministic
nutrition modules remain the source of truth for all numbers and for which
foods exist -- the model is only allowed to talk about foods that
lookup_food / suggest_meal actually returned from the database.
"""
import json
import os
import re
from datetime import datetime

from openai import OpenAI

try:
    from backend import math_engine, memory_agent, menu_planner, rag_resolver
except ImportError:
    import math_engine, memory_agent, menu_planner, rag_resolver

MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
API_KEY = os.getenv("OPENROUTER_API_KEY")
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=API_KEY) if API_KEY else None


def tool_save_onboarding(name, age, sex, height_cm, current_weight_kg, target_weight_kg, goal, activity_level,
                          allergies="", medical_conditions="", sleep_schedule="", diet="any"):
    bmr, tdee = math_engine.calculate_bmr_tdee(age, sex, height_cm, current_weight_kg, activity_level)
    targets = math_engine.calculate_targets(tdee, goal, current_weight_kg)
    profile = {
        "name": name, "age": age, "sex": sex, "height_cm": height_cm,
        "current_weight_kg": current_weight_kg, "target_weight_kg": target_weight_kg,
        "goal": goal, "activity_level": activity_level, "allergies": allergies,
        "medical_conditions": medical_conditions, "sleep_schedule": sleep_schedule, "diet": diet,
        "bmr_kcal": bmr, "tdee_kcal": tdee,
        "onboarded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), **targets,
    }
    memory_agent.save_user_profile(profile)
    return {"status": "onboarded", **profile}


def tool_log_food_item(item_name, quantity, meal_type, unit="serving"):
    diet = memory_agent.get_user_diet()
    match = rag_resolver.resolve_food(item_name, diet=diet)
    if match.get("status") != "matched":
        return match
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity, unit)
    if "error" in macros:
        return macros
    memory_agent.log_meal(meal_type, match["matched_food_code"], macros["food_name"], quantity,
                           macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"],
                           unit=macros["unit"], serving_label=macros.get("serving_label"))
    budget = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
    today_totals = None if "error" in budget else {
        "calories": round(budget["consumed_calories"], 1), "protein_g": round(budget["consumed_protein_g"], 1),
        "carbs_g": round(budget["consumed_carbs_g"], 1), "fat_g": round(budget["consumed_fat_g"], 1),
        "remaining_calories": budget["remaining_calories"], "remaining_protein_g": budget["remaining_protein_g"],
    }
    return {"status": "logged", "matched_to": macros["food_name"], "match_confidence": match.get("confidence"),
            "today_totals": today_totals, **macros}


# The model sometimes *says* it logged a food without ever calling log_food
# (or after log_food returned an error). Nothing is saved in that case, so the
# food never reaches the Food log page. These helpers catch that claim.
_LOGGED_CLAIM = re.compile(
    r"\b(i['\u2019]?ve|i have|i just|i)\s+(just\s+)?(logged|added|saved|recorded)\b"
    r"|\bsuccessfully\s+(logged|added|saved)\b"
    r"|\b(logged|added|saved)\s+(it|that|them|this)\s+(to|in|into)\b"
    r"|\bhas been (logged|added|saved) to\b",
    re.IGNORECASE,
)


def _claims_logged(text: str) -> bool:
    return bool(text and _LOGGED_CLAIM.search(text))


def _log_succeeded(events: list) -> bool:
    return any(e.get("tool") == "log_food" and (e.get("result") or {}).get("status") == "logged" for e in events)


def _last_log_error(events: list) -> str:
    for e in reversed(events):
        if e.get("tool") == "log_food" and (e.get("result") or {}).get("status") != "logged":
            r = e.get("result") or {}
            return str(r.get("error") or r.get("message") or r.get("status") or "unknown error")
    return ""


def _context():
    today = datetime.now().strftime("%Y-%m-%d")
    profile = memory_agent.get_user_profile()
    budget = math_engine.get_remaining_budget_today(today)
    meals = memory_agent.get_todays_logs()
    # Long-term memory: re-check for behavioural patterns (e.g. recurring
    # low breakfast protein, favourite foods, over/under-eating) on every
    # turn and hand any findings to the model, so the coach can proactively
    # mention them instead of only reacting to what's asked.
    memory_agent.detect_patterns()
    patterns = memory_agent.get_active_patterns()["patterns"]
    facts = memory_agent.get_user_facts()
    return {"profile": profile, "budget": budget, "meals": meals, "detected_patterns": patterns, "known_facts": facts}


def interact(user_message: str) -> str:
    """Kept for backward compatibility with any caller that only wants a
    plain text reply with no tool-calling."""
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
# The model is given tools that wrap the RAG resolver, math engine, and
# memory agent. The model NEVER invents a calorie/macro number or a food
# name -- every number and every food the user sees came out of
# lookup_food / suggest_meal, which call rag_resolver + math_engine + the
# real food_items table directly. The model's only job is conversation and
# deciding intent (what food, how much, in what unit, which meal, and
# whether the user actually confirmed).

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_food",
            "description": (
                "Resolve a colloquial Indian food name against the nutrition database "
                "(RAG match + exact macro lookup), WITHOUT logging it yet. Always call this "
                "first whenever the user mentions eating or drinking something, before you say "
                "any numbers or ask to log it. If the user didn't say a quantity or a unit, call "
                "this once with quantity=1 and unit='serving' to see what's available (the result "
                "tells you whether a standard serving exists), then ask the user whether they mean "
                "1 standard serving (e.g. 1 bowl / 1 plate / 1 piece -- use the exact unit name the "
                "tool returns) or an amount in grams, before logging."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "Food name as the user said it, e.g. 'idli', 'thatte idli', 'chai'."},
                    "quantity": {"type": "number", "description": "Amount, in the given unit. Default to 1 if the user didn't say."},
                    "unit": {
                        "type": "string", "enum": ["serving", "grams"],
                        "description": "'serving' = number of standard servings (e.g. 2 idlis). 'grams' = weight in grams (e.g. 150g paneer). Default 'serving'.",
                    },
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
                "a prior lookup_food call in this conversation, AND after the user has told "
                "you (or you've otherwise established) whether the quantity is servings or "
                "grams. Never call this on the first mention of a food, and never guess the unit."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string"},
                    "quantity": {"type": "number"},
                    "unit": {"type": "string", "enum": ["serving", "grams"]},
                    "meal_type": {
                        "type": "string",
                        "enum": ["breakfast", "lunch", "dinner", "snack"],
                        "description": "Defaults to 'snack' if the user hasn't said which meal.",
                    },
                },
                "required": ["item_name", "quantity", "unit"],
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
    {
        "type": "function",
        "function": {
            "name": "suggest_meal",
            "description": (
                "Suggest real foods FROM THE DATABASE ONLY that fit the user's remaining calorie/protein "
                "budget for today. Always call this instead of naming foods from general knowledge when "
                "the user asks what to eat, what meals to have, or how to hit their goals -- never invent "
                "or suggest a food that didn't come back from this tool."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "meal_type": {
                        "type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"],
                        "description": "Which meal slot the suggestion is for, if the user specified one.",
                    },
                    "whole_day": {
                        "type": "boolean",
                        "description": "True if the user wants suggestions for the whole remaining day rather than one meal.",
                    },
                },
                "required": [],
            },
        },
    },
]


def _tool_lookup_food(item_name, quantity=1, unit="serving"):
    diet = memory_agent.get_user_diet()
    match = rag_resolver.resolve_food(item_name, diet=diet)
    if match.get("status") != "matched":
        return match
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity, unit)
    if "error" in macros:
        return macros
    return {"status": "found", "match_confidence": match.get("confidence"), "match_method": match.get("match_method"), **macros}


def _tool_suggest_meal(meal_type=None, whole_day=False):
    diet = memory_agent.get_user_diet()
    budget = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
    if "error" in budget:
        return budget
    if whole_day:
        return menu_planner.suggest_day_plan(
            budget["remaining_calories"], budget["remaining_protein_g"],
            budget["remaining_carbs_g"], budget["remaining_fat_g"], diet,
        )
    return menu_planner.suggest_next_meal(budget["remaining_protein_g"], budget["remaining_calories"], diet, meal_type)


TOOL_IMPL = {
    "lookup_food": lambda args: _tool_lookup_food(args.get("item_name", ""), args.get("quantity", 1) or 1, args.get("unit") or "serving"),
    "log_food": lambda args: tool_log_food_item(args.get("item_name", ""), args.get("quantity", 1) or 1, args.get("meal_type") or "snack", args.get("unit") or "serving"),
    "get_today_summary": lambda args: _context(),
    "suggest_meal": lambda args: _tool_suggest_meal(args.get("meal_type"), bool(args.get("whole_day"))),
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
        "its real calories/protein/carbs/fat -- never guess, estimate, or recall nutrition numbers from "
        "your own knowledge.\n"
        "UNITS MATTER: lookup_food's result tells you whether the food has a standard serving (e.g. "
        "'1 bowl', '1 plate', '1 idli') and/or can be logged by weight in grams. If the user didn't "
        "already specify, ask them: 'Did you have about 1 <serving unit>, or would you rather log it in "
        "grams?' Never assume -- entering a gram amount as if it were a serving count (or vice versa) "
        "produces wildly wrong totals, which is exactly what you must avoid. If a food has no reliable "
        "standard serving in the database (lookup_food will say so), grams is the only option -- ask for "
        "the weight in grams.\n"
        "After lookup_food returns a match, tell the user the matched food name, quantity + unit, "
        "calories, protein, carbs and fat, then ask if they'd like it logged to today's meals and as "
        "which meal (breakfast/lunch/dinner/snack). Only call log_food once the user has clearly "
        "confirmed both the food and the unit.\n"
        "NEVER say a food was logged/added/saved unless log_food returned status 'logged' in THIS turn. "
        "If the user confirms ('yes', 'log it', 'add it') you MUST call log_food -- do not just reply that it is done. "
        "If log_food fails, tell the user it was NOT logged and why. Never recite today's totals from memory: "
        "use the 'today_totals' returned by log_food or the meals in the live context below.\n"
        "If lookup_food returns not_found, say so plainly, don't invent numbers, and ask them to rephrase "
        "or try a simpler/more common name. If it returns diet_mismatch, tell them that food doesn't fit "
        "their diet and ask if they'd like an alternative.\n"
        "When the user asks what to eat, for meal ideas, or how to hit their goals, ALWAYS call "
        "suggest_meal and present ONLY the foods it returns -- never suggest a food from your own "
        "knowledge, even one that sounds healthy or plausible. If suggest_meal returns nothing useful, "
        "say so honestly rather than filling in your own suggestions.\n"
        "If detected_patterns in the context is non-empty, weave a brief, supportive mention of the "
        "most relevant one into your reply where it fits naturally (e.g. noticing low breakfast protein, "
        "or a favourite food) -- don't force it into every message.\n"
        "Keep replies short (2-4 sentences) and conversational. Do not diagnose medical conditions; "
        "suggest professional advice for medical questions.\n"
        f"Live context (profile, remaining budget, meals already logged today, detected long-term "
        f"patterns, known facts about the user):\n{json.dumps(context, default=str)}"
    )

    messages = [{"role": "system", "content": system}]
    for turn in (history or []):
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            content = turn["content"]
            # An earlier assistant turn that claimed a log which never happened
            # would teach the model to keep doing it -- flag it in the transcript.
            if turn["role"] == "assistant" and _claims_logged(content) and not _log_succeeded(turn.get("tool_events") or []):
                content += "\n\n[System note: nothing was actually saved to the food log in this message.]"
            messages.append({"role": turn["role"], "content": content})
    messages.append({"role": "user", "content": user_message})

    tool_events = []
    nudged = False
    for _ in range(MAX_TOOL_ROUNDS + 1):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.3,
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            reply = msg.content or "I could not generate a response right now."
            if _claims_logged(reply) and not _log_succeeded(tool_events):
                if not nudged:
                    # Ask the model to actually call log_food (or retract the claim).
                    nudged = True
                    messages.append({"role": "assistant", "content": reply})
                    messages.append({"role": "system", "content": (
                        "Your last reply says a food was logged, but log_food has not succeeded in this turn, so nothing "
                        "was saved. If the user confirmed logging, call log_food now using the food, quantity, unit and "
                        "meal from the conversation. Otherwise reply again WITHOUT claiming anything was logged.")})
                    continue
                error = _last_log_error(tool_events)
                reply = ("I couldn't save that to your food log" + (f" ({error})" if error else "") +
                         ". Nothing was added yet -- tell me the food, amount and meal again and I'll retry.")
            return {"reply": reply, "tool_events": tool_events}

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
    return _tool_suggest_meal()


def tool_get_profile():
    return memory_agent.get_user_profile()