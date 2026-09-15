"""
Master Orchestrator Agent
==========================
The only piece that talks to the LLM and to the user. Everything else
(Math Engine, RAG Resolver, Memory Agent, Menu Planner) is exposed to it
as tools. It decides which tools to call for a given message, and
synthesizes their outputs into one clean, coach-toned reply.

Run this file directly to chat with NutriSync.
"""

import json
import os
from datetime import datetime
from openai import OpenAI

import math_engine
import rag_resolver
import memory_agent
import menu_planner

# ==========================================================
# CLIENT
# ==========================================================
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",
)
MODEL = "openai/gpt-4o-mini"

# ==========================================================
# TOOLS  (thin wrappers around the other agent files)
# ==========================================================

def tool_save_onboarding(name, age, sex, height_cm, current_weight_kg, target_weight_kg,
                          goal, activity_level, allergies, medical_conditions, sleep_schedule) -> str:
    """
    Runs the Math Engine to calculate BMR/TDEE/targets, then hands the
    complete profile to the Memory Agent to persist. This is the one-time
    onboarding action.
    """
    bmr, tdee = math_engine.calculate_bmr_tdee(age, sex, height_cm, current_weight_kg, activity_level)
    targets = math_engine.calculate_targets(tdee, goal, current_weight_kg)

    profile = {
        "name": name, "age": age, "sex": sex, "height_cm": height_cm,
        "current_weight_kg": current_weight_kg, "target_weight_kg": target_weight_kg,
        "goal": goal, "activity_level": activity_level, "allergies": allergies,
        "medical_conditions": medical_conditions, "sleep_schedule": sleep_schedule,
        "bmr_kcal": bmr, "tdee_kcal": tdee,
        "onboarded_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        **targets,
    }
    memory_agent.save_user_profile(profile)
    return json.dumps({"status": "onboarded", "bmr": bmr, "tdee": tdee, **targets})


def tool_log_food_item(item_name: str, quantity: float, meal_type: str) -> str:
    """
    The core daily-logging action. Chains RAG resolve -> Math Engine
    calculation -> Memory Agent save, in that order, for ONE food item.
    For a full meal with multiple items, the LLM calls this once per item.
    """
    match = rag_resolver.resolve_food(item_name)
    if match["status"] != "matched":
        return json.dumps({"status": "not_found", "item": item_name,
                            "message": "Couldn't find this food in the database. Ask the user to clarify or rephrase."})

    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity)
    if "error" in macros:
        return json.dumps(macros)

    memory_agent.log_meal(
        meal_type=meal_type,
        food_code=match["matched_food_code"],
        food_name=macros["food_name"],
        quantity=quantity,
        calories=macros["calories"],
        protein_g=macros["protein_g"],
        carbs_g=macros["carbs_g"],
        fat_g=macros["fat_g"],
    )
    return json.dumps({
        "status": "logged",
        "matched_to": macros["food_name"],
        "match_confidence": match["confidence"],
        **macros,
    })


def tool_get_remaining_budget() -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    return json.dumps(math_engine.get_remaining_budget_today(today))


def tool_get_todays_log() -> str:
    return json.dumps(memory_agent.get_todays_logs())


def tool_check_patterns() -> str:
    memory_agent.detect_patterns()  # runs detection, saves any new ones
    return json.dumps(memory_agent.get_active_patterns())


def tool_suggest_meal() -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    budget = math_engine.get_remaining_budget_today(today)
    if "error" in budget:
        return json.dumps(budget)
    suggestions = menu_planner.suggest_next_meal(
        budget["remaining_protein_g"], budget["remaining_calories"]
    )
    return json.dumps(suggestions)


def tool_get_profile() -> str:
    return json.dumps(memory_agent.get_user_profile())


tools = [
    {
        "type": "function",
        "function": {
            "name": "save_onboarding",
            "description": (
                "Call this ONCE, only when the user has provided all onboarding info "
                "(name, age, sex, height, current weight, target weight, goal, activity "
                "level, allergies, medical conditions, sleep schedule). Calculates BMR/TDEE/ "
                "targets and saves the profile permanently."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "age": {"type": "integer"},
                    "sex": {"type": "string", "enum": ["male", "female"]},
                    "height_cm": {"type": "number"},
                    "current_weight_kg": {"type": "number"},
                    "target_weight_kg": {"type": "number"},
                    "goal": {"type": "string", "enum": ["fat_loss", "muscle_gain", "recomp", "maintenance"]},
                    "activity_level": {"type": "string", "enum": ["sedentary", "casual", "gym", "bodybuilder"]},
                    "allergies": {"type": "string"},
                    "medical_conditions": {"type": "string"},
                    "sleep_schedule": {"type": "string"},
                },
                "required": ["name", "age", "sex", "height_cm", "current_weight_kg",
                              "target_weight_kg", "goal", "activity_level"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_food_item",
            "description": (
                "Log ONE food item the user ate. If they mention multiple items "
                "('2 idli and 1 vada'), call this once per distinct item. "
                "meal_type must be breakfast, lunch, dinner, or snack."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "e.g. 'idli', 'vada', 'chai'"},
                    "quantity": {"type": "number", "description": "number of servings, e.g. 2"},
                    "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "dinner", "snack"]},
                },
                "required": ["item_name", "quantity", "meal_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_remaining_budget",
            "description": "Get today's consumed and remaining calories/protein/carbs/fat vs targets. Call after logging a meal, or when asked about progress.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_todays_log",
            "description": "Get the full list of everything logged today.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_patterns",
            "description": "Check for long-term habit patterns (e.g. recurring low protein). Call once per conversation, not every message, to avoid repeating yourself.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_meal",
            "description": "Get realistic next-meal suggestions from the real food database, based on today's remaining macro budget.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_profile",
            "description": "Get the user's saved profile and targets. Call this first in any new conversation to check if onboarding is already done.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

tools_map = {
    "save_onboarding": lambda **kw: tool_save_onboarding(**kw),
    "log_food_item": lambda **kw: tool_log_food_item(**kw),
    "get_remaining_budget": lambda **kw: tool_get_remaining_budget(),
    "get_todays_log": lambda **kw: tool_get_todays_log(),
    "check_patterns": lambda **kw: tool_check_patterns(),
    "suggest_meal": lambda **kw: tool_suggest_meal(),
    "get_profile": lambda **kw: tool_get_profile(),
}

# ==========================================================
# GOAL / PERSONA
# ==========================================================
system_instruction = """
You are NutriSync India, a personal clinical nutritionist and coach for
Indian food. Direct, disciplined, encouraging, data-backed.

FIRST MESSAGE OF ANY SESSION: call get_profile. If not_onboarded, run
onboarding conversationally -- ask for name, age, sex, height, current
weight, target weight, goal, activity level, allergies, medical
conditions, and sleep schedule (a few at a time, not all at once as a
wall of questions). Once you have everything, call save_onboarding.

DAILY LOGGING FLOW (once onboarded):
1. When the user describes food eaten, call log_food_item once per
   distinct item (infer quantity and meal_type from context and time of
   day if not stated -- state the assumption if you're guessing).
2. After logging, call get_remaining_budget and report the meal's macros
   plus what's left for the day, in a clean breakdown.
3. Call suggest_meal and propose a specific next-meal option grounded in
   the real returned options -- never invent a dish not in the results.
4. Occasionally (not every message) call check_patterns and mention any
   new pattern found, framed constructively.
5. End every response with ONE targeted habit question (e.g. oil used,
   portion specifics) AND a wellness checkpoint (hydration, sleep).

Never invent nutrition numbers -- only report numbers that came from a
tool result. If log_food_item returns not_found, ask the user to
clarify or rename the item rather than guessing its macros. If a
logged item's result includes data_quality_warning, tell the user
honestly that this particular database entry looks off and offer to
log a similar dish instead, rather than presenting the number as fact.
"""

conversation_history = [{"role": "system", "content": system_instruction}]


# ==========================================================
# THE LOOP
# ==========================================================
def interact(user_message: str):
    conversation_history.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL, messages=conversation_history, tools=tools, tool_choice="auto",
    )
    msg = response.choices[0].message

    # Agentic loop: keep executing tool calls until the model is done
    # reasoning and produces a final text reply (handles multi-item meals
    # needing several sequential log_food_item calls).
    while msg.tool_calls:
        conversation_history.append(msg)
        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)
            result = tools_map[fn_name](**fn_args)
            print(f"  [Action] {fn_name}({fn_args}) -> {result[:200]}")
            conversation_history.append({
                "tool_call_id": tool_call.id, "role": "tool", "name": fn_name, "content": result,
            })

        response = client.chat.completions.create(
            model=MODEL, messages=conversation_history, tools=tools, tool_choice="auto",
        )
        msg = response.choices[0].message

    conversation_history.append(msg)
    print(f"\nNutriSync: {msg.content}\n")


if __name__ == "__main__":
    print("--- NutriSync India (type 'exit' to stop) ---\n")
    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit", "q"):
                print("Session ended.")
                break
            interact(user_input)
        except KeyboardInterrupt:
            print("\nSession stopped.")
            break
