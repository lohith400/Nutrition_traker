"""Unit test configuration and shared fixtures.

Ensures all tests are completely offline, deterministic, and isolated from
external services (no real Turso, no LLMs, no external network).
"""
import os
import shutil
import sqlite3
import sys
from pathlib import Path

import pytest

# Ensure repository root and backend directory are in sys.path
ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
for p in (BACKEND_DIR, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


@pytest.fixture(autouse=True)
def isolate_environment(monkeypatch):
    """Enforce offline execution and unset all Turso/LLM variables."""
    forbidden_vars = [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "OPENROUTER_API_KEY",
        "GEMINI_API_KEY",
        "DEEPSEEK_API_KEY",
        "LLM_PROVIDER",
        "LLM_MODEL",
    ]
    for var in forbidden_vars:
        monkeypatch.setenv(var, "")

    # Prevent reminders background loop if any module starts it
    monkeypatch.setenv("NUTRISYNC_NO_SCHEDULER", "1")


@pytest.fixture
def mock_db(tmp_path, monkeypatch):
    """Provide a temporary, fast SQLite database with test tables and sample rows."""
    db_file = tmp_path / "test_unit.db"
    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row

    # Create food_items table matching Anuvaad schema
    conn.executescript("""
        CREATE TABLE food_items (
            food_code TEXT PRIMARY KEY,
            food_name TEXT NOT NULL,
            quality TEXT,
            quality_note TEXT,
            diet_tag TEXT,
            servings_unit TEXT,
            serving_grams REAL,
            energy_kcal_100g REAL,
            protein_g_100g REAL,
            carb_g_100g REAL,
            fat_g_100g REAL,
            fibre_g_100g REAL,
            unit_serving_energy_kcal REAL,
            unit_serving_protein_g REAL,
            unit_serving_carb_g REAL,
            unit_serving_fat_g REAL,
            unit_serving_fibre_g REAL,
            unit_serving_calcium_mg REAL,
            unit_serving_magnesium_mg REAL,
            unit_serving_sodium_mg REAL,
            unit_serving_potassium_mg REAL,
            unit_serving_iron_mg REAL,
            unit_serving_copper_mg REAL,
            unit_serving_zinc_mg REAL,
            unit_serving_vita_ug REAL,
            unit_serving_vite_mg REAL,
            unit_serving_vitd2_ug REAL,
            unit_serving_vitd3_ug REAL,
            unit_serving_vitk1_ug REAL,
            unit_serving_vitk2_ug REAL,
            unit_serving_folate_ug REAL,
            unit_serving_vitb1_mg REAL,
            unit_serving_vitb2_mg REAL,
            unit_serving_vitb3_mg REAL,
            unit_serving_vitb5_mg REAL,
            unit_serving_vitb6_mg REAL,
            unit_serving_vitb7_ug REAL,
            unit_serving_vitc_mg REAL,
            calcium_mg_100g REAL,
            magnesium_mg_100g REAL,
            sodium_mg_100g REAL,
            potassium_mg_100g REAL,
            iron_mg_100g REAL,
            copper_mg_100g REAL,
            zinc_mg_100g REAL,
            vita_ug_100g REAL,
            vite_mg_100g REAL,
            vitd2_ug_100g REAL,
            vitd3_ug_100g REAL,
            vitk1_ug_100g REAL,
            vitk2_ug_100g REAL,
            folate_ug_100g REAL,
            vitb1_mg_100g REAL,
            vitb2_mg_100g REAL,
            vitb3_mg_100g REAL,
            vitb5_mg_100g REAL,
            vitb6_mg_100g REAL,
            vitb7_ug_100g REAL,
            vitc_mg_100g REAL
        );

        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY,
            name TEXT,
            age INTEGER,
            sex TEXT,
            height_cm REAL,
            current_weight_kg REAL,
            target_weight_kg REAL,
            goal TEXT,
            activity_level TEXT,
            diet TEXT,
            target_calories REAL,
            target_protein_g REAL,
            target_carbs_g REAL,
            target_fat_g REAL,
            target_water_l REAL
        );

        CREATE TABLE daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT,
            food_name TEXT,
            food_code TEXT,
            quantity REAL,
            unit TEXT,
            meal_type TEXT,
            calories REAL,
            protein_g REAL,
            carbs_g REAL,
            fat_g REAL,
            fibre_g REAL
        );

        CREATE TABLE food_preferences (
            food_code TEXT PRIMARY KEY,
            times_logged INTEGER DEFAULT 1
        );
    """)

    # Populate a couple of test foods (valid idli, unreliable paneer pulao, grams-only item)
    conn.execute("""
        INSERT INTO food_items (
            food_code, food_name, quality, quality_note, diet_tag,
            servings_unit, serving_grams,
            energy_kcal_100g, protein_g_100g, carb_g_100g, fat_g_100g, fibre_g_100g,
            unit_serving_energy_kcal, unit_serving_protein_g, unit_serving_carb_g, unit_serving_fat_g, unit_serving_fibre_g
        ) VALUES (
            'ASC144', 'Idli', 'ok', NULL, 'vegan',
            'idli', 25.0,
            137.5, 4.6, 28.2, 0.3, 2.3,
            34.5, 1.2, 7.1, 0.1, 0.6
        )
    """)
    conn.execute("""
        INSERT INTO food_items (
            food_code, food_name, quality, quality_note, diet_tag,
            servings_unit, serving_grams,
            energy_kcal_100g, protein_g_100g, carb_g_100g, fat_g_100g,
            unit_serving_energy_kcal
        ) VALUES (
            'UNR001', 'Paneer pulao', 'unreliable', 'per-serving value looks like a whole-recipe total', 'vegetarian',
            'plate', 850.0,
            180.0, 6.0, 22.0, 7.0,
            1530.0
        )
    """)
    conn.execute("""
        INSERT INTO food_items (
            food_code, food_name, quality, quality_note, diet_tag,
            servings_unit, serving_grams,
            energy_kcal_100g, protein_g_100g, carb_g_100g, fat_g_100g
        ) VALUES (
            'GRO001', 'Raw Moong Dal', 'grams_only', 'no serving size in source data', 'vegan',
            NULL, NULL,
            348.0, 24.0, 59.9, 1.2
        )
    """)
    conn.commit()
    conn.close()

    db_path_str = str(db_file)
    monkeypatch.setenv("NUTRISYNC_DB_PATH", db_path_str)

    from backend import math_engine, rag_resolver
    math_engine.DB_PATH = db_path_str
    rag_resolver.DB_PATH = db_path_str
    rag_resolver._index_cache.update(key=None, rows=[])

    yield db_path_str


@pytest.fixture
def real_db(tmp_path, monkeypatch):
    """Copy the real 1,014-item nutrisync.db into tmp_path for isolated golden tests."""
    src_db = ROOT / "nutrisync.db"
    dest_db = tmp_path / "nutrisync_real.db"
    if src_db.exists():
        shutil.copyfile(src_db, dest_db)
    else:
        # Fallback if nutrisync.db does not exist: build it using db_setup
        from backend import db_setup
        db_setup.DB_PATH = str(dest_db)
        db_setup.build_database()

    db_path_str = str(dest_db)
    monkeypatch.setenv("NUTRISYNC_DB_PATH", db_path_str)

    from backend import math_engine, rag_resolver
    math_engine.DB_PATH = db_path_str
    rag_resolver.DB_PATH = db_path_str
    rag_resolver._index_cache.update(key=None, rows=[])

    yield db_path_str
