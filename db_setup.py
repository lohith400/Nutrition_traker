"""
NutriSync Database Setup
=========================
Run this once to build nutrisync.db from the Anuvaad Excel file and
create every table the 5-agent system needs.

Tables:
  food_items       - 1,014 verified Indian foods (from Anuvaad/IFCT data)
  user_profile      - the Dynamic User Profile (one row, this is a single-user app)
  daily_logs        - every meal ever logged (short-term memory lives here: "today")
  detected_patterns - long-term memory: trends noticed across many days
"""

import sqlite3
import openpyxl
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "nutrisync.db")
EXCEL_PATH = os.path.join(os.path.dirname(__file__), "data", "anuvaad.xlsx")


def build_database():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript("""
    DROP TABLE IF EXISTS food_items;
    DROP TABLE IF EXISTS user_profile;
    DROP TABLE IF EXISTS daily_logs;
    DROP TABLE IF EXISTS detected_patterns;

    -- Real Indian food nutrition data, one row per dish.
    -- Storing both per-100g and per-standard-serving numbers, exactly as
    -- the source data provides, so the Math Engine never has to guess a
    -- conversion factor.
    CREATE TABLE food_items (
        food_code               TEXT PRIMARY KEY,
        food_name                TEXT NOT NULL,
        energy_kcal_100g          REAL,
        carb_g_100g               REAL,
        protein_g_100g            REAL,
        fat_g_100g                REAL,
        fibre_g_100g              REAL,
        servings_unit             TEXT,
        unit_serving_energy_kcal  REAL,
        unit_serving_carb_g       REAL,
        unit_serving_protein_g    REAL,
        unit_serving_fat_g        REAL,
        unit_serving_fibre_g      REAL
    );

    -- Single-user profile. All the onboarding answers + calculated targets.
    CREATE TABLE user_profile (
        id                  INTEGER PRIMARY KEY CHECK (id = 1),  -- enforces only 1 row ever
        name                TEXT,
        age                 INTEGER,
        sex                 TEXT,
        height_cm           REAL,
        current_weight_kg   REAL,
        target_weight_kg    REAL,
        goal                TEXT,        -- fat_loss / muscle_gain / recomp / maintenance
        activity_level      TEXT,        -- sedentary / casual / gym / bodybuilder
        allergies           TEXT,
        medical_conditions  TEXT,
        sleep_schedule      TEXT,
        bmr_kcal            REAL,
        tdee_kcal           REAL,
        target_calories     REAL,
        target_protein_g    REAL,
        target_carbs_g      REAL,
        target_fat_g        REAL,
        target_water_l      REAL,
        onboarded_at        TEXT
    );

    -- Every logged meal, ever. This IS short-term memory (query "today")
    -- and the raw material long-term memory is built from (query "last 7 days").
    CREATE TABLE daily_logs (
        log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
        log_date         TEXT NOT NULL,      -- YYYY-MM-DD
        log_time         TEXT NOT NULL,      -- full timestamp
        meal_type        TEXT,               -- breakfast/lunch/dinner/snack
        food_code        TEXT,
        food_name        TEXT,
        quantity         REAL,
        calories         REAL,
        protein_g        REAL,
        carbs_g          REAL,
        fat_g            REAL
    );

    -- Long-term memory: trends noticed by the Memory Agent across many
    -- days, e.g. "low breakfast protein, 3 days running". The Orchestrator
    -- reads this to sound like it actually knows the user's habits.
    CREATE TABLE detected_patterns (
        pattern_id      INTEGER PRIMARY KEY AUTOINCREMENT,
        detected_on      TEXT NOT NULL,
        pattern_type     TEXT,       -- e.g. 'low_protein_breakfast', 'weekend_drift'
        description      TEXT,
        still_active      INTEGER DEFAULT 1
    );
    """)
    conn.commit()

    # Load the Excel data into food_items
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {name: i for i, name in enumerate(header)}

    inserted = 0
    for row in rows:
        if not row[col["food_name"]]:
            continue
        cur.execute(
            """INSERT OR REPLACE INTO food_items
               (food_code, food_name, energy_kcal_100g, carb_g_100g, protein_g_100g,
                fat_g_100g, fibre_g_100g, servings_unit, unit_serving_energy_kcal,
                unit_serving_carb_g, unit_serving_protein_g, unit_serving_fat_g,
                unit_serving_fibre_g)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row[col["food_code"]],
                row[col["food_name"]],
                row[col["energy_kcal"]],
                row[col["carb_g"]],
                row[col["protein_g"]],
                row[col["fat_g"]],
                row[col["fibre_g"]],
                row[col["servings_unit"]],
                row[col["unit_serving_energy_kcal"]],
                row[col["unit_serving_carb_g"]],
                row[col["unit_serving_protein_g"]],
                row[col["unit_serving_fat_g"]],
                row[col["unit_serving_fibre_g"]],
            ),
        )
        inserted += 1

    conn.commit()
    conn.close()
    print(f"Database built at {DB_PATH} -- {inserted} food items loaded.")


if __name__ == "__main__":
    build_database()
