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

try:
    from backend import custom_foods, google_fit, grocery, llm_config, math_engine, memory_agent, menu_planner, perf, places_finder, rag_resolver, reminders
except ImportError:
    import custom_foods, google_fit, grocery, llm_config, math_engine, memory_agent, menu_planner, perf, places_finder, rag_resolver, reminders

# Primary provider: Google AI Studio (Gemini) with zero-crash cascade; fallback: OpenRouter, DeepSeek.
client, MODEL, PROVIDER = llm_config.build_client()


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
    """True when this turn really saved something: a food log, a water log, or a grocery list change."""
    for e in events:
        status = (e.get("result") or {}).get("status")
        if e.get("tool") == "log_food" and status == "logged":
            return True
        if e.get("tool") == "log_water" and status == "logged":
            return True
        if e.get("tool") in ("add_grocery_items", "remove_grocery_items") and status == "ok":
            return True
        if e.get("tool") == "set_reminder" and status == "created":
            return True
    return False


def _last_log_error(events: list) -> str:
    for e in reversed(events):
        if e.get("tool") == "log_food" and (e.get("result") or {}).get("status") != "logged":
            r = e.get("result") or {}
            return str(r.get("error") or r.get("message") or r.get("status") or "unknown error")
    return ""


def _context():
    """Everything the coach needs to know right now. The independent reads run at the same time
    (each is a network round trip on the remote database), and the 10-minute pattern detection is
    kicked off in the background instead of delaying the reply."""
    today = datetime.now().strftime("%Y-%m-%d")
    memory_agent.maybe_detect_patterns_background()
    profile, budget, meals, patterns, facts, today_fitness = perf.parallel(
        memory_agent.get_user_profile,
        lambda: math_engine.get_remaining_budget_today(today),
        memory_agent.get_todays_logs,
        lambda: memory_agent.get_active_patterns()["patterns"],
        memory_agent.get_user_facts,
        lambda: google_fit.get_today_stored_fitness(today),
    )
    return {
        "profile": profile,
        "budget": budget,
        "meals": meals,
        "detected_patterns": patterns,
        "known_facts": facts,
        "daily_fitness": today_fitness or {
            "log_date": today,
            "steps": 0,
            "calories_burned": 0.0,
            "running_minutes": 0.0,
            "distance_km": 0.0,
            "active_minutes": 0.0,
            "source": "google_fit",
            "synced_at": "",
        },
    }


def interact(user_message: str) -> str:
    """Kept for backward compatibility with any caller that only wants a
    plain text reply with no tool-calling."""
    if client is None:
        raise RuntimeError("No AI key configured (set OPENROUTER_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY)")
    context = _context()
    system = (
        "You are NutriSync India, a concise and supportive nutrition coach. "
        "Use only nutrition numbers present in the supplied context; never invent them. "
        "Do not diagnose medical conditions. Encourage professional advice for medical questions. "
        f"Live context:\n{json.dumps(context, default=str)}"
    )
    response = llm_config.create_completion(
        client,
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
                "tool returns) or an amount in grams, before logging. The result is status 'found' (one exact food), "
                "'options' (several related foods the user must choose between -- the app shows them as cards), "
                "'found_needs_grams', 'diet_mismatch' or 'not_found'."
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
    {
        "type": "function",
        "function": {
            "name": "log_water",
            "description": (
                "Log water intake for today. Call this whenever the user mentions drinking water or logging water, "
                "e.g. 'I drank 3 liters of water', 'drank 250ml water', 'drank 2 glasses of water', 'log 500ml water'. "
                "Convert the amount to liters (e.g. 3.0 for 3 liters, 0.25 for 250ml or 1 glass, 0.5 for 500ml). "
                "Plain drinking water is NEVER a food item and must NEVER be looked up with lookup_food or log_food."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "amount_l": {
                        "type": "number",
                        "description": "Amount of water consumed in liters (e.g. 0.25 for 250ml, 0.5 for 500ml, 3.0 for 3 liters).",
                    },
                },
                "required": ["amount_l"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_restaurants",
            "description": (
                "Find real restaurants/hotels near the user (OpenStreetMap, or Google Places if configured). Call this whenever the user asks "
                "for restaurants, hotels, places to eat, or veg / non-veg / pure-veg options near them. Set "
                "diet_filter='veg' for veg or pure-veg requests, 'non_veg' for non-veg requests, otherwise 'any'. "
                "Put a dish or cuisine in `query` if they mention one (e.g. 'biryani', 'dosa'). If the user named "
                "an area or city, pass it in `area`; otherwise the app uses their shared GPS location. "
                "Menus are NOT available -- never invent a restaurant's menu, ratings or prices."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "diet_filter": {"type": "string", "enum": ["veg", "non_veg", "any"]},
                    "query": {"type": "string", "description": "Optional dish or cuisine, e.g. 'biryani'."},
                    "area": {"type": "string", "description": "Optional area/city the user named, e.g. 'Indiranagar, Bengaluru'."},
                },
                "required": ["diet_filter"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_reminder",
            "description": (
                "Create a reminder that pings the user at a time to eat a food or drink water. Call it when the user "
                "says things like 'remind me at 4 pm to drink water' or 'remind me to eat a boiled egg at 11:30'. "
                "Convert the time to 24-hour HH:MM. Default repeat is 'daily' unless they say 'once' / 'today only'. "
                "auto_log=true makes the app log the food/water automatically when the reminder fires; use false if "
                "they only want a nudge."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["food", "water"]},
                    "time": {"type": "string", "description": "24-hour HH:MM, e.g. '16:00'."},
                    "repeat": {"type": "string", "enum": ["daily", "once"]},
                    "food_name": {"type": "string", "description": "For kind='food': the food, e.g. 'boiled egg'."},
                    "quantity": {"type": "number"},
                    "unit": {"type": "string", "enum": ["serving", "grams"]},
                    "meal_type": {"type": "string", "enum": ["breakfast", "lunch", "snack", "dinner"]},
                    "water_ml": {"type": "number", "description": "For kind='water': amount in ml (default 250)."},
                    "auto_log": {"type": "boolean"},
                },
                "required": ["kind", "time"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_grocery_items",
            "description": (
                "Add ingredients the user has bought / has at home to their grocery list (pantry). Call it whenever "
                "the user says things like 'add 1 kg rice', 'I bought 6 eggs and 2 kg tomato', 'put paneer in my grocery'. "
                "No confirmation needed. This only edits the list -- it is NOT the food log."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Ingredient name, e.g. 'rice', 'tomato'."},
                                "quantity": {"type": "number", "description": "Amount; 1 if the user gave none."},
                                "unit": {"type": "string", "description": "kg, g, l, ml, pcs, pack, dozen or bunch. Use pcs for counted things like eggs."},
                            },
                            "required": ["name"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_grocery_items",
            "description": (
                "Remove ingredients from the grocery list, or reduce their quantity, when the user says they used "
                "them up / finished them / want them removed ('remove tomato', 'I used 200 g rice'). Leave quantity "
                "out to remove the item completely."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "quantity": {"type": "number"},
                                "unit": {"type": "string"},
                            },
                            "required": ["name"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_grocery_list",
            "description": (
                "Read the user's grocery list (ingredients they have at home). Call this ONLY when the user explicitly "
                "asks for a meal/recipe made from what they have (e.g. 'suggest a meal from my grocery list', 'what can I "
                "cook today with what I have', 'use my available ingredients'), or asks to see/check their grocery list. "
                "Do NOT call it for ordinary 'what should I eat' questions -- those use suggest_meal."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_grocery_meal",
            "description": (
                "After get_grocery_list, propose ONE meal made ONLY from items on the grocery list and get its exact "
                "nutrition. Pass every ingredient with the gram amount you want to use (convert pieces to grams, e.g. "
                "1 egg ~ 50 g). The tool checks each ingredient is on the list and in stock, looks up nutrition in the "
                "food database and adds up calories / protein / carbs / fat for you -- never add numbers yourself. "
                "Water and salt are always allowed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "meal_name": {"type": "string", "description": "e.g. 'Egg fried rice'."},
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Ingredient exactly as named on the grocery list."},
                                "grams": {"type": "number", "description": "Amount to use, in grams."},
                            },
                            "required": ["name", "grams"],
                        },
                    },
                },
                "required": ["meal_name", "ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_recipe",
            "description": (
                "Work out the calories / protein / carbs / fat of a dish the user made from their own ingredients, e.g. 'I made upma with 60 g rava, "
                "1 tbsp oil, 1 onion and a handful of peanuts'. Pass every ingredient with its quantity and unit exactly as the user said (g, kg, ml, "
                "tsp, tbsp, cup, katori, pcs, ...). The tool matches each ingredient to the dataset / reference values and adds everything up -- never add "
                "numbers yourself. Use this instead of lookup_food when the user lists ingredients. It does not log anything."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "meal_name": {"type": "string", "description": "Name of the dish, e.g. 'Rava upma'."},
                    "servings": {"type": "number", "description": "How many servings the recipe makes (default 1)."},
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "quantity": {"type": "number"},
                                "unit": {"type": "string", "description": "g, kg, ml, l, tsp, tbsp, cup, katori, pcs, slice, clove, pinch, handful"},
                            },
                            "required": ["name", "quantity"],
                        },
                    },
                },
                "required": ["meal_name", "ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fitness_summary",
            "description": (
                "Get the user's recorded physical activity (steps, calories burned, running/active minutes, distance) "
                "from Google Fit. Can return today's stats (days=1) or recent daily history up to 7 days."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Number of days of activity history to inspect (1 to 7). Defaults to 1 (today only).",
                    }
                },
            },
        },
    },
]


def _tool_find_restaurants(args, location=None):
    diet_filter = args.get("diet_filter") or "any"
    area = (args.get("area") or "").strip()
    lat = lng = None
    if location and location.get("lat") is not None and location.get("lng") is not None:
        lat, lng = float(location["lat"]), float(location["lng"])
    if not area and lat is None:
        return {"status": "need_location",
                "message": "I don't have the user's location. Ask them to tap the location pin next to the message box and allow location access, or tell you their area/city."}
    result = places_finder.search_restaurants(args.get("query") or "", diet_filter, area, lat, lng)
    if result.get("status") != "ok":
        return result
    # Google has no menu data. Offer dish ideas that come from the NutriSync food database,
    # sized to what is left in today's budget, so the user has something to order.
    try:
        budget = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
        diet = "vegetarian" if diet_filter == "veg" else memory_agent.get_user_diet()
        if "error" not in budget:
            ideas = menu_planner.suggest_next_meal(budget["remaining_protein_g"], budget["remaining_calories"], diet, None)
            result["dish_ideas_from_database"] = ideas.get("options", [])
    except Exception:
        pass
    result["menu_note"] = "No menu data is available. Point the user to maps_url / website for the real menu."
    return result


def _water_result(item_name):
    clean = (item_name or "").strip().lower()
    if clean in ("water", "drinking water", "plain water", "mineral water", "glass of water", "tap water", "water glass") or re.match(r"^(\d+(\.\d+)?\s*(l|liter|liters|ml|glass|glasses)\s*)?(of\s*)?water$", clean):
        return {
            "status": "not_a_food",
            "message": "Plain drinking water has zero calories and is tracked separately as water intake. Use the log_water tool with the amount in liters (e.g. 0.25 for a glass, 0.5 for 500ml, 3.0 for 3 liters) to log water.",
        }
    return None


def _tool_lookup_food_options(item_name, quantity=1, unit="serving"):
    """What the coach's lookup_food tool returns: ONE exact match, or the RELATED foods to choose from.

    The old behaviour guessed a single food (sometimes wrongly: "masala chai" -> "Masala arbi") or said
    "not found". Now, unless the name matches exactly one food, the user is shown every related food in the
    dataset with its nutrition and picks which one they had before anything is logged.
    """
    water = _water_result(item_name)
    if water:
        return water
    diet = memory_agent.get_user_diet()
    cands = rag_resolver.find_candidates(item_name, diet=diet, limit=6)
    hidden = rag_resolver.count_hidden_by_diet(item_name, diet)
    exact = [c for c in cands if c.get("exact")]
    if len(exact) == 1:
        pick = exact[0]
        macros = math_engine.calculate_meal_macros(pick["food_code"], quantity, unit)
        others = [c for c in cands if c["food_code"] != pick["food_code"]][:4]
        base = {"match_method": "exact", "selected": pick, "related": others, "food_code": pick["food_code"], "source": pick["source"]}
        if "error" in macros:  # e.g. no reliable serving size: the card still lets the user log it in grams
            return {"status": "found_needs_grams", "food_name": pick["food_name"], **base, **macros}
        return {"status": "found", "match_confidence": 1.0, **base, **macros}
    if cands:
        return {
            "status": "options", "query": item_name, "quantity": quantity, "unit": unit, "options": cands, "hidden_by_diet": hidden,
            "message": (f"No single exact match for '{item_name}', but {len(cands)} related food(s) exist (shown to the user as tappable cards with full "
                        "nutrition). Do NOT say the food was not found, do NOT pick one for them and do NOT log anything. Tell them briefly you found related "
                        "foods, name the top 2-3 with their calories per serving from the result, and ask which one they had and how much."),
        }
    if hidden:
        return {"status": "diet_mismatch", "query": item_name, "diet": diet}
    return {"status": "not_found", "query": item_name,
            "message": "Nothing related in the database or reference list. Ask them to describe it differently or give its main ingredients (the app can build a custom food from ingredients)."}


def _tool_lookup_food(item_name, quantity=1, unit="serving"):
    water = _water_result(item_name)
    if water:
        return water
    diet = memory_agent.get_user_diet()
    match = rag_resolver.resolve_food(item_name, diet=diet)
    if match.get("status") != "matched":
        return match
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], quantity, unit)
    if "error" in macros:
        return macros
    return {"status": "found", "match_confidence": match.get("confidence"), "match_method": match.get("match_method"), **macros}


def _tool_log_water(amount_l):
    try:
        val = float(amount_l)
        if val <= 0:
            return {"status": "error", "message": "Amount of water must be greater than 0."}
        memory_agent.log_water(val)
        todays = memory_agent.get_todays_water()
        profile = memory_agent.get_user_profile()
        target = (profile.get("target_water_l") if profile else None) or 6.5
        consumed = todays["consumed_water_l"]
        return {
            "status": "logged",
            "amount_l": val,
            "consumed_water_l": consumed,
            "target_water_l": target,
            "remaining_water_l": round(max(0.0, target - consumed), 2),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


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


_FREE_INGREDIENTS = {"water", "salt"}


def _tool_get_grocery_list():
    items = grocery.list_items()
    if not items:
        return {"status": "empty", "items": [],
                "message": "The grocery list is empty. Tell the user to add ingredients (here in chat or on the Grocery page)."}
    return {"status": "ok", "items": [{"name": i["name"], "quantity": i["quantity"], "unit": i["unit"]} for i in items]}


def _tool_analyze_grocery_meal(meal_name, ingredients):
    """Builds a meal strictly from the grocery list. Enforced in code, not just in the prompt."""
    if not ingredients:
        return {"status": "error", "error": "No ingredients given."}
    not_on_list, short_on_stock, rows, unresolved = [], [], [], []
    for ing in ingredients:
        name = str(ing.get("name", "")).strip()
        try:
            grams = float(ing.get("grams") or 0)
        except (TypeError, ValueError):
            grams = 0
        if not name or grams <= 0:
            continue
        if name.lower() in _FREE_INGREDIENTS:
            continue
        item = grocery.find_item(name)
        if not item:
            not_on_list.append(name)
            continue
        stock = grocery.grams_available(item)
        if stock is not None and grams > stock + 0.5:
            short_on_stock.append({"name": item["name"], "needed_g": round(grams), "have": f"{item['quantity']} {item['unit']}"})
            continue
        rows.append((item, grams))
    if not_on_list:
        return {"status": "rejected", "not_on_grocery_list": not_on_list,
                "message": "These ingredients are NOT on the user's grocery list. Rebuild the meal using only listed items (plus water/salt), or tell the user what is missing."}
    if short_on_stock:
        return {"status": "rejected", "not_enough_stock": short_on_stock,
                "message": "The user doesn't have enough of these. Reduce the amounts or pick other listed items."}
    if not rows:
        return {"status": "error", "error": "No usable ingredients."}

    lines, totals = [], {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for item, grams in rows:
        found = _tool_lookup_food(item["name"], grams, "grams")
        if found.get("status") != "found":
            unresolved.append({"name": item["name"], "reason": str(found.get("error") or found.get("message") or found.get("status"))})
            continue
        lines.append({"name": item["name"], "grams": round(grams), "matched_to": found.get("food_name"),
                      "calories": round(found["calories"], 1), "protein_g": round(found["protein_g"], 1),
                      "carbs_g": round(found["carbs_g"], 1), "fat_g": round(found["fat_g"], 1)})
        for k in totals:
            totals[k] += found[k]
    if not lines:
        return {"status": "error", "error": "Couldn't find nutrition data for any of these ingredients.", "unresolved": unresolved}
    result = {"status": "ok", "meal_name": meal_name, "ingredients": lines,
              "totals": {k: round(v, 1) for k, v in totals.items()}}
    if unresolved:
        result["unresolved"] = unresolved
        result["note"] = "Totals exclude the unresolved ingredients. Say so."
    budget = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
    if "error" not in budget:
        result["remaining_today_before_this_meal"] = {"calories": budget["remaining_calories"], "protein_g": budget["remaining_protein_g"]}
    return result


def _tool_analyze_recipe(args):
    ingredients = [{"name": i.get("name"), "quantity": i.get("quantity"), "unit": i.get("unit") or "g"} for i in (args.get("ingredients") or []) if isinstance(i, dict)]
    result = custom_foods.analyze(args.get("meal_name") or "My recipe", args.get("servings") or 1, ingredients, use_ai=True)
    if result.get("status") != "ok":
        return result
    # Keep the chat event small: the UI needs the per-100g values to save the dish, not the alternative lists.
    for line in result["ingredients"]:
        line.pop("alternatives", None)
    result["note_for_coach"] = ("Report the per-serving and total numbers exactly as given. Mention anything in 'warnings' or 'unresolved'. Tell the user they can "
                                "tap 'Save as custom food' on the card, after which you can log it by name.")
    return result


def _tool_set_reminder(args):
    return reminders.create_reminder(
        args.get("kind", ""), args.get("time", ""), args.get("repeat") or "daily", args.get("food_name"),
        args.get("quantity") or 1, args.get("unit") or "serving", args.get("meal_type"),
        args.get("water_ml"), args.get("auto_log", True) is not False,
    )


def _tool_get_fitness_summary(days=1):
    days = max(1, min(int(days or 1), 7))
    today = datetime.now().strftime("%Y-%m-%d")
    if days == 1:
        stored = google_fit.get_today_stored_fitness(today)
        if stored:
            return {"status": "ok", "days": [stored], "today": stored}
        return {
            "status": "ok",
            "days": [],
            "today": {
                "log_date": today,
                "steps": 0,
                "calories_burned": 0.0,
                "running_minutes": 0.0,
                "distance_km": 0.0,
                "active_minutes": 0.0,
                "source": "google_fit",
            },
            "message": "No fitness activity recorded for today yet. Google Fit may be syncing or awaiting configuration.",
        }
    history = google_fit.get_fitness_history(days)
    return {"status": "ok", "days": history, "count": len(history)}


TOOL_IMPL = {
    "set_reminder": _tool_set_reminder,
    "add_grocery_items": lambda args: grocery.add_items(args.get("items") or []),
    "remove_grocery_items": lambda args: grocery.remove_items(args.get("items") or []),
    "get_grocery_list": lambda args: _tool_get_grocery_list(),
    "analyze_grocery_meal": lambda args: _tool_analyze_grocery_meal(args.get("meal_name", "Meal"), args.get("ingredients") or []),
    "lookup_food": lambda args: _tool_lookup_food_options(args.get("item_name", ""), args.get("quantity", 1) or 1, args.get("unit") or "serving"),
    "analyze_recipe": _tool_analyze_recipe,
    "log_food": lambda args: tool_log_food_item(args.get("item_name", ""), args.get("quantity", 1) or 1, args.get("meal_type") or "snack", args.get("unit") or "serving"),
    "log_water": lambda args: _tool_log_water(args.get("amount_l") or 0),
    "get_today_summary": lambda args: _context(),
    "suggest_meal": lambda args: _tool_suggest_meal(args.get("meal_type"), bool(args.get("whole_day"))),
    "get_fitness_summary": lambda args: _tool_get_fitness_summary(args.get("days", 1)),
}

MAX_TOOL_ROUNDS = 5

_LOG_NUDGE = (
    "Your last reply says a food was logged, but log_food has not succeeded in this turn, so nothing "
    "was saved. If the user confirmed logging, call log_food (or add_grocery_items for groceries) now using the details from the conversation. Otherwise reply again WITHOUT claiming anything was logged."
)


def _tool_call_dict(tc) -> dict:
    """Assistant tool call as sent back to the API. Newer Gemini models attach an opaque
    `extra_content` (thought signature) that must be echoed back or the next call is rejected."""
    entry = {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
    extra = (getattr(tc, "model_extra", None) or {}).get("extra_content")
    if extra:
        entry["extra_content"] = extra
    return entry


def _prepare_messages(user_message: str, history: list | None = None, image: str | None = None,
                      context: dict | None = None) -> list:
    """System prompt + live context + earlier turns + the new user turn, ready to send to the model."""
    if context is None:
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
        "WATER INTAKE: Plain drinking water has zero calories/macros and is tracked separately. "
        "When the user mentions drinking water (e.g. 'I drank 3 liters of water', 'drank 250ml water', 'had a glass of water'), "
        "ALWAYS call the log_water tool with the amount in liters (e.g. 3.0 for 3 liters, 0.25 for 250ml/1 glass, 0.5 for 500ml). "
        "NEVER call lookup_food or log_food for plain water! Water is tracked strictly via log_water.\n"
        "NEVER say a food was logged/added/saved unless log_food returned status 'logged' in THIS turn. "
        "If the user confirms ('yes', 'log it', 'add it') you MUST call log_food -- do not just reply that it is done. "
        "If log_food fails, tell the user it was NOT logged and why. Never recite today's totals from memory: "
        "use the 'today_totals' returned by log_food or the meals in the live context below.\n"
        "RESTAURANTS: when the user asks for restaurants/hotels/places to eat near them (veg, non-veg, pure veg), "
        "call find_restaurants -- never name restaurants from your own knowledge. Present at most 4-5 results "
        "briefly (name, distance, cuisine, and rating/price/hours only if the result has them -- never invent a rating). Use diet_filter 'veg' for veg/pure-veg, 'non_veg' for "
        "non-veg. Note that 'pure veg' can't be fully verified -- only what the map data says. "
        "No menus are available: never invent a restaurant's dishes or prices. Instead say ratings, photos and the real menu are behind the "
        "Maps link (and website if given), and offer 'what to order' ideas ONLY from dish_ideas_from_database (or suggest_meal), "
        "clearly saying these are ideas that fit their remaining budget, not confirmed items on that restaurant's menu. "
        "If find_restaurants returns need_location, ask them to tap the location pin or tell you their area. "
        "If it returns not_configured or error, tell them plainly what is wrong.\n"
        "REMINDERS: when the user asks to be reminded to eat or drink water at a time, call set_reminder and confirm the "
        "time, what, and whether it auto-logs. Only say a reminder was set if set_reminder returned status 'created'; "
        "if it returns an error, tell the user why.\n"
        "GROCERY LIST (separate from everything else): the user keeps a list of ingredients they have at home. "
        "(a) When they say they bought/have/want to add ingredients ('add 1 kg rice, 1 kg tomato'), call "
        "add_grocery_items and confirm what was added; when they say they used up or want to remove something, call "
        "remove_grocery_items. Never claim the list changed unless the tool returned status 'ok'. "
        "(b) ONLY when the user explicitly asks for a meal made from their grocery list / what they have at home / "
        "available ingredients: call get_grocery_list, then build ONE simple meal using ONLY listed items (water and salt "
        "are free; oil, spices, milk etc. only if they are on the list), call analyze_grocery_meal with gram amounts, "
        "and report its meal name, ingredients with amounts, and the total calories, protein, carbs and fat exactly "
        "as returned. Mention any ingredient the tool matched to a differently named database food, and how it fits "
        "the remaining budget. If the list is empty or can't make a proper meal, say so and say what is missing -- "
        "never suggest ingredients they don't have. If the tool rejects an ingredient, rebuild without it. Then ask "
        "whether to log it (and as which meal); on a clear yes, call log_food once per ingredient with unit 'grams'; "
        "afterwards offer to remove the used amounts from the grocery list. "
        "(c) For every OTHER request about what to eat, do NOT look at the grocery list -- use suggest_meal as usual.\n"
        "FOOD OPTIONS: lookup_food returns status 'found' when the name matches exactly one food. When it returns 'options' there is no "
        "single exact match, but related foods DO exist in the dataset: the app shows them to the user as cards with calories, protein, carbs "
        "and fat. Never tell the user the food 'could not be found' in that case. Say you found related foods, mention the top two or three with "
        "their calories per serving (numbers from the result only), and ask which one they had and how much. The user can tap a card to log it "
        "directly, or answer in chat; when they answer in chat, call lookup_food again with the exact food_name they chose. Never choose among options "
        "for them and never log from an 'options' result. Foods labelled source 'reference' are typical values for everyday staples (banana, milk, raw "
        "rice, oil) and source 'custom' are the user's own saved dishes -- you may say so.\n"
        "'found_needs_grams' means the exact food exists but has no reliable serving size: ask for the weight in grams. "
        "If lookup_food returns not_found, say so plainly, don't invent numbers, and suggest describing it by its main ingredients -- then use analyze_recipe. "
        "If it returns diet_mismatch, tell them that food doesn't fit their diet and ask if they'd like an alternative.\n"
        "HOME-COOKED DISHES: when the user lists ingredients with amounts ('I made upma with 60 g rava, 1 tbsp oil and an onion'), call analyze_recipe "
        "with every ingredient and its unit, then report servings, per-serving and total calories/protein/carbs/fat exactly as returned, and flag any "
        "'unresolved' ingredient or AI-estimated line honestly. Tell them they can tap 'Save as custom food' on the card; once saved you can log it by name.\n"
        "When the user asks what to eat, for meal ideas, or how to hit their goals (and did NOT ask to use their grocery list), ALWAYS call "
        "suggest_meal and present ONLY the foods it returns -- never suggest a food from your own "
        "knowledge, even one that sounds healthy or plausible. If suggest_meal returns nothing useful, "
        "say so honestly rather than filling in your own suggestions.\n"
        "If detected_patterns in the context is non-empty, weave a brief, supportive mention of the "
        "most relevant one into your reply where it fits naturally (e.g. noticing low breakfast protein, "
        "or a favourite food) -- don't force it into every message.\n"
        "PHYSICAL ACTIVITY & GOOGLE FIT:\n"
        "- When steps, calories_burned, or active/running minutes are present in live context (daily_fitness) or from get_fitness_summary, "
        "factor real activity into meal suggestions — e.g. a more active day with high calories_burned can justify a higher-calorie/protein "
        "meal suggestion from suggest_meal; a very low-activity day is a prompt to gently suggest more movement, not a reason to invent food "
        "advice outside what suggest_meal returns.\n"
        "- The coach must NEVER adjust or override the stored target_calories / target_protein_g etc. from user_profile on its own — you may "
        "only talk about activity context, and must still only ever name foods that suggest_meal / lookup_food actually returned, same rule as "
        "the existing food-suggestion instructions.\n"
        "- If get_fitness_summary or context shows Google Fit is not configured or steps are 0 all day, say so plainly rather than inventing numbers.\n"
        "- Do not diagnose or give medical exercise advice beyond general, non-clinical encouragement; this app is not a doctor.\n"
        "Keep replies short (2-4 sentences) and conversational. Do not diagnose medical conditions; "
        "suggest professional advice for medical questions.\n"
        f"Live context (profile, remaining budget, meals already logged today, detected long-term "
        f"patterns, known facts about the user, today's daily_fitness):\n{json.dumps(context, default=str)}"
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
    if image:
        prompt = user_message or "What meal is this? Look it up and tell me the nutrition."
        prompt = (
            "[The user attached a photo of their meal.] " + prompt + "\n"
            "Identify every distinct food/dish you can see, using common Indian names where they apply. "
            "For EACH one call lookup_food with your best estimate of how many standard servings are visible "
            "(e.g. 2 idlis -> quantity 2, unit 'serving'). Then show what was found, say plainly that portion size "
            "is estimated from the photo, and ask whether to log it (and as which meal) or whether the amount "
            "should be corrected. Do NOT call log_food until the user confirms. If you cannot tell what the food "
            "is, say so and ask them to type its name."
        )
        messages.append({"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image}},
        ]})
    else:
        messages.append({"role": "user", "content": user_message})
    return messages


def chat_with_tools(user_message: str, history: list | None = None, image: str | None = None,
                    location: dict | None = None, context: dict | None = None) -> dict:
    """Runs a bounded tool-calling loop against the configured LLM provider.

    `history` is the prior turns as stored by memory_agent.get_chat_history()
    (role/content dicts). Returns {"reply": str, "tool_events": [...]}, where
    tool_events records every tool call + result made during this turn so the
    frontend can render a "found in database" / "logged" card inline.
    """
    if client is None:
        raise RuntimeError("No AI key configured (set OPENROUTER_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY)")

    messages = _prepare_messages(user_message, history, image, context)
    tool_events = []
    nudged = False
    for _ in range(MAX_TOOL_ROUNDS + 1):
        response = llm_config.create_completion(
            client,
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
                    messages.append({"role": "system", "content": _LOG_NUDGE})
                    continue
                error = _last_log_error(tool_events)
                reply = ("I couldn't save that to your food log" + (f" ({error})" if error else "") +
                         ". Nothing was added yet -- tell me the food, amount and meal again and I'll retry.")
            return {"reply": reply, "tool_events": tool_events}

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [_tool_call_dict(tc) for tc in msg.tool_calls],
        })

        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            impl = TOOL_IMPL.get(name)
            if name == "find_restaurants":
                result = _tool_find_restaurants(args, location)
            else:
                result = impl(args) if impl else {"error": f"unknown tool '{name}'"}
            tool_events.append({"tool": name, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)})

    return {
        "reply": "I ran into trouble figuring that out -- could you rephrase what you ate?",
        "tool_events": tool_events,
    }


# ---------------------------------------------------------------------------------------------
# Streaming version of the coach loop
#
# Exactly the same rules as chat_with_tools() (same prompt, same tools, same "never claim a food
# was logged unless log_food succeeded" guard) -- the only difference is that the final answer is
# handed to the caller word by word as the model writes it, so the screen starts filling after
# ~1 second instead of staying blank until the whole reply is finished.
#
# Events yielded (plain dicts):
#   {"type": "tool_start", "name", "args"}   a tool is about to run (UI shows "Looking up idli...")
#   {"type": "tool_end",   "name", "status"} that tool finished
#   {"type": "delta",      "text"}           more reply text
#   {"type": "reset"}                        discard the reply text shown so far (the guard is retrying)
#   {"type": "final",      "reply", "tool_events"}
# ---------------------------------------------------------------------------------------------
class _ToolCall:
    """Stands in for the SDK's tool-call object so _tool_call_dict() works on streamed pieces."""

    def __init__(self, call_id: str):
        self.id = call_id
        self.function = type("Fn", (), {"name": "", "arguments": ""})()
        self.model_extra: dict = {}


def _stream_round(messages: list):
    """One model call. Yields ("delta", text) while it writes, then ("end", content, tool_calls)."""
    content_parts: list[str] = []
    calls: list[_ToolCall] = []
    by_index: dict = {}
    emitted = False
    try:
        stream = llm_config.create_completion(
            client, model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.3, stream=True,
        )
        for chunk in stream:
            if not getattr(chunk, "choices", None):
                continue
            delta = chunk.choices[0].delta
            text = getattr(delta, "content", None)
            if text:
                content_parts.append(text)
                emitted = True
                yield ("delta", text)
            for tc in (getattr(delta, "tool_calls", None) or []):
                idx = getattr(tc, "index", None)
                tid = getattr(tc, "id", None)
                slot = by_index.get(idx) if idx is not None else None
                # Some providers (Gemini's OpenAI layer) reuse index 0 for every call: a new id means a new call.
                if slot is not None and tid and slot.id and tid != slot.id:
                    slot = None
                if slot is None:
                    slot = _ToolCall(tid or f"call_{len(calls)}")
                    calls.append(slot)
                    if idx is not None:
                        by_index[idx] = slot
                fn = getattr(tc, "function", None)
                if fn is not None:
                    if getattr(fn, "name", None):
                        slot.function.name += fn.name
                    if getattr(fn, "arguments", None):
                        slot.function.arguments += fn.arguments
                extra = (getattr(tc, "model_extra", None) or {}).get("extra_content")
                if extra:
                    slot.model_extra["extra_content"] = extra
        yield ("end", "".join(content_parts), calls)
        return
    except Exception as exc:  # noqa: BLE001 -- some models/providers can't stream with tools: fall back to one call
        import logging
        logging.getLogger("uvicorn.error").warning("streaming failed, using a normal call instead: %s", exc)
    if emitted:
        yield ("reset",)
    response = llm_config.create_completion(
        client, model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.3,
    )
    msg = response.choices[0].message
    fallback_calls = []
    for tc in (msg.tool_calls or []):
        c = _ToolCall(tc.id)
        c.function.name, c.function.arguments = tc.function.name, tc.function.arguments
        c.model_extra = dict(getattr(tc, "model_extra", None) or {})
        fallback_calls.append(c)
    if msg.content:
        yield ("delta", msg.content)
    yield ("end", msg.content or "", fallback_calls)


def _tool_status(result) -> str:
    return str(result.get("status") or ("error" if "error" in result else "ok")) if isinstance(result, dict) else "ok"


def chat_with_tools_stream(user_message: str, history: list | None = None, image: str | None = None,
                           location: dict | None = None, context: dict | None = None):
    """Generator version of chat_with_tools(); see the event list above."""
    if client is None:
        raise RuntimeError("No AI key configured (set OPENROUTER_API_KEY, GEMINI_API_KEY or DEEPSEEK_API_KEY)")

    messages = _prepare_messages(user_message, history, image, context)
    tool_events: list = []
    nudged = False
    for _ in range(MAX_TOOL_ROUNDS + 1):
        content, tool_calls, shown = "", [], False
        for ev in _stream_round(messages):
            if ev[0] == "delta":
                shown = True
                yield {"type": "delta", "text": ev[1]}
            elif ev[0] == "reset":
                shown = False
                yield {"type": "reset"}
            else:
                content, tool_calls = ev[1], ev[2]

        if not tool_calls:
            reply = content or "I could not generate a response right now."
            if _claims_logged(reply) and not _log_succeeded(tool_events):
                if not nudged:
                    nudged = True
                    messages.append({"role": "assistant", "content": reply})
                    messages.append({"role": "system", "content": _LOG_NUDGE})
                    yield {"type": "reset"}
                    continue
                error = _last_log_error(tool_events)
                reply = ("I couldn't save that to your food log" + (f" ({error})" if error else "") +
                         ". Nothing was added yet -- tell me the food, amount and meal again and I'll retry.")
                yield {"type": "reset"}
                yield {"type": "delta", "text": reply}
            elif not shown:
                yield {"type": "delta", "text": reply}
            yield {"type": "final", "reply": reply, "tool_events": tool_events}
            return

        if shown:  # text written before a tool call is a preamble, not the answer (same as chat_with_tools)
            yield {"type": "reset"}
        messages.append({
            "role": "assistant",
            "content": content or "",
            "tool_calls": [_tool_call_dict(tc) for tc in tool_calls],
        })
        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            yield {"type": "tool_start", "name": name, "args": args}
            impl = TOOL_IMPL.get(name)
            if name == "find_restaurants":
                result = _tool_find_restaurants(args, location)
            else:
                result = impl(args) if impl else {"error": f"unknown tool '{name}'"}
            tool_events.append({"tool": name, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)})
            yield {"type": "tool_end", "name": name, "status": _tool_status(result)}

    reply = "I ran into trouble figuring that out -- could you rephrase what you ate?"
    yield {"type": "delta", "text": reply}
    yield {"type": "final", "reply": reply, "tool_events": tool_events}


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