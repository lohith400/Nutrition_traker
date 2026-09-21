"""NutriSync coach service used by both the CLI and FastAPI.

The API key is deliberately read from the environment. The deterministic
nutrition modules remain the source of truth for all numbers.
"""
import json
import os
from datetime import datetime

from openai import OpenAI

import math_engine
import memory_agent
import menu_planner
import rag_resolver

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
    return {"profile": profile, "budget": budget, "meals": meals}


def interact(user_message: str) -> str:
    """Answer a coach question using live profile, budget, and meal context."""
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
