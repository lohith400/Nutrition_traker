from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="NutriSync API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FoodLogRequest(BaseModel):
    item_name: str
    quantity: float = 1.0
    meal_type: str = "breakfast"

@app.get("/health")
def health():
    return {"status": "ok", "service": "NutriSync API"}

@app.get("/api/profile")
def get_profile():
    return {
        "status": "onboarded",
        "name": "Arjun Rao",
        "goal": "fat_loss",
        "target_calories": 2200,
        "target_protein_g": 120,
        "target_carbs_g": 260,
        "target_fat_g": 60,
    }

@app.get("/api/overview")
def get_overview():
    return {
        "date": "2026-09-21",
        "consumed_calories": 890,
        "remaining_calories": 1310,
        "consumed_protein_g": 39,
        "remaining_protein_g": 81,
        "consumed_carbs_g": 112,
        "remaining_carbs_g": 148,
        "consumed_water_l": 1.2,
        "target_water_l": 2.8,
        "suggestion": "Add a protein-rich snack like sprouts or Greek yogurt."
    }

@app.get("/api/recent-meals")
def get_recent_meals():
    return [
        {"name": "Masala dosa", "type": "Breakfast", "time": "08:30 AM", "calories": 312, "protein_g": 8},
        {"name": "Paneer tikka bowl", "type": "Lunch", "time": "01:15 PM", "calories": 486, "protein_g": 28},
        {"name": "Filter coffee", "type": "Snack", "time": "04:40 PM", "calories": 92, "protein_g": 3},
    ]

@app.post("/api/log-food")
def log_food(payload: FoodLogRequest):
    return {
        "status": "logged",
        "matched_to": payload.item_name,
        "quantity": payload.quantity,
        "meal_type": payload.meal_type,
        "calories": 248,
        "protein_g": 11,
        "carbs_g": 34,
        "fat_g": 7,
        "message": "Food logged successfully."
    }

@app.post("/api/chat")
def chat():
    return {
        "reply": "Your protein is slightly behind today. A dal or paneer-based meal would help you close the gap without overshooting calories.",
        "coach_ok": True,
    }

@app.get("/api/suggestions")
def get_suggestions():
    return {
        "status": "ok",
        "strategy": "high_protein_priority",
        "options": [
            {"food_name": "Curd with sprouts", "unit_serving_energy_kcal": 180, "unit_serving_protein_g": 18, "servings_unit": "bowl"},
            {"food_name": "Paneer salad", "unit_serving_energy_kcal": 220, "unit_serving_protein_g": 22, "servings_unit": "plate"},
            {"food_name": "Egg bhurji", "unit_serving_energy_kcal": 260, "unit_serving_protein_g": 20, "servings_unit": "serving"},
        ],
    }
