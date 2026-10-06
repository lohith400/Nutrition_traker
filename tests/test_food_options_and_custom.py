"""Tests for related-food options, custom foods, editing logs and weight tracking."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "backend", ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from tests.test_smoke import test_client  # noqa: F401,E402  (shared temp-database fixture)

PROFILE = dict(name="T", age=30, sex="male", height_cm=175, current_weight_kg=80, target_weight_kg=72,
               goal="fat_loss", activity_level="casual", diet="any")


@pytest.fixture(scope="module")
def client(test_client):  # noqa: F811
    assert test_client.post("/api/profile/onboarding", json=PROFILE).status_code == 200
    return test_client


def names(resp):
    return [o["food_name"] for o in resp["options"]]


def test_related_foods_instead_of_not_found(client):
    r = client.get("/api/food-options", params={"q": "masala chai"}).json()
    assert r["options"], "a drink that is in the dataset under another name must still produce options"
    assert any("tea" in n.lower() or "chai" in n.lower() for n in names(r))
    # every option carries nutrition so the user can compare
    assert all(o["per_serving"] or o["per_100g"] for o in r["options"])


def test_substring_false_positives_are_gone(client):
    r = client.get("/api/food-options", params={"q": "tea"}).json()
    assert not any("gateau" in n.lower() for n in names(r))


def test_staples_come_from_reference_table(client):
    r = client.get("/api/food-options", params={"q": "banana"}).json()
    top = r["options"][0]
    assert top["food_code"] == "ref:banana" and top["source"] == "reference"


def test_log_by_code_and_edit_and_delete(client):
    r = client.post("/api/log-food-code", json={"food_code": "ref:banana", "quantity": 2, "unit": "serving", "meal_type": "snack"})
    assert r.status_code == 200
    body = r.json()
    assert body["calories"] == 210.0 and body["log_id"]
    lid = body["log_id"]
    e = client.patch(f"/api/log/{lid}", json={"quantity": 100, "unit": "grams"})
    assert e.status_code == 200 and e.json()["log"]["calories"] == 89.0
    assert client.delete(f"/api/log/{lid}").status_code == 200
    assert client.delete(f"/api/log/{lid}").status_code == 404


def test_cannot_log_future_day(client):
    r = client.post("/api/log-food-code", json={"food_code": "ref:banana", "quantity": 1, "unit": "serving", "date": "2999-01-01"})
    assert r.status_code == 422


def test_past_day_logging(client):
    from datetime import datetime, timedelta
    day = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
    r = client.post("/api/log-food-code", json={"food_code": "ref:banana", "quantity": 1, "unit": "serving", "meal_type": "lunch", "date": day})
    assert r.status_code == 200 and r.json()["date"] == day
    too_old = client.post("/api/log-food-code", json={"food_code": "ref:banana", "quantity": 1, "unit": "serving", "date": "2020-01-02"})
    assert too_old.status_code == 422


def test_recipe_math_and_save_and_log(client):
    ings = [
        {"name": "rava", "quantity": 100, "unit": "g"},
        {"name": "oil", "quantity": 1, "unit": "tbsp"},
        {"name": "unobtainium", "quantity": 50, "unit": "g"},
    ]
    a = client.post("/api/custom-foods/analyze", json={"name": "Test upma", "servings": 2, "ingredients": ings, "use_ai": False}).json()
    by = {l["name"]: l for l in a["ingredients"]}
    assert by["rava"]["nutrition"]["calories"] == 348.0
    assert by["oil"]["grams"] == 13.8 and by["oil"]["grams_estimated"]
    assert by["unobtainium"]["status"] == "needs_input"           # unknown stuff is never invented
    assert a["unresolved"] == ["unobtainium"] and not a["complete"]
    expected = round(348.0 + 13.8 * 9, 1)
    assert a["totals"]["calories"] == pytest.approx(expected, abs=0.2)
    assert a["per_serving"]["calories"] == pytest.approx(expected / 2, abs=0.2)

    good = [l for l in a["ingredients"] if l["status"] != "needs_input"]
    saved = client.post("/api/custom-foods", json={"name": "Test upma", "servings": 2, "serving_label": "plate", "ingredients": good})
    assert saved.status_code == 200
    food = saved.json()["food"]
    assert food["per_serving"]["calories"] == pytest.approx(expected / 2, abs=0.2)
    assert client.post("/api/custom-foods", json={"name": "test UPMA", "servings": 1, "ingredients": good}).status_code == 409

    opts = client.get("/api/food-options", params={"q": "test upma"}).json()
    assert opts["options"][0]["food_code"] == food["food_code"]

    logged = client.post("/api/log-food-code", json={"food_code": food["food_code"], "quantity": 1, "unit": "serving", "meal_type": "dinner"})
    assert logged.status_code == 200 and logged.json()["calories"] == pytest.approx(expected / 2, abs=0.2)
    byname = client.post("/api/log-food", json={"item_name": "Test upma", "quantity": 1, "unit": "serving", "meal_type": "dinner"})
    assert byname.status_code == 200 and byname.json()["matched_to"] == "Test upma"

    assert client.delete(f"/api/custom-foods/{food['id']}").status_code == 200


def test_ai_estimate_sanity_check():
    from backend import custom_foods
    assert custom_foods._sane_estimate({"calories": 400, "protein_g": 10, "carbs_g": 60, "fat_g": 12}) is not None
    assert custom_foods._sane_estimate({"calories": 100, "protein_g": 90, "carbs_g": 60, "fat_g": 50}) is None   # > 100 g of macros per 100 g
    assert custom_foods._sane_estimate({"calories": 50, "protein_g": 0, "carbs_g": 0, "fat_g": 50}) is None      # calories contradict macros


def test_weight_tracking(client):
    assert client.post("/api/weight", json={"weight_kg": 79.0}).status_code == 200
    assert client.post("/api/weight", json={"weight_kg": 10}).status_code == 422
    entries = client.get("/api/weight").json()["entries"]
    assert entries and entries[-1]["weight_kg"] == 79.0
    assert client.delete(f"/api/weight/{entries[-1]['log_date']}").status_code == 200


def test_pantry_nutrition(client):
    client.post("/api/grocery", json={"name": "Toor dal", "quantity": 500, "unit": "g"})
    n = client.get("/api/grocery/nutrition").json()
    row = next(i for i in n["items"] if i["id"])
    assert n["counted"] >= 1 and row["nutrition"]["calories"] > 1000


def test_coach_gets_options_not_a_guess():
    from backend import orchestrator
    res = orchestrator._tool_lookup_food_options("masala chai")
    assert res["status"] == "options" and len(res["options"]) >= 2
    assert orchestrator._tool_lookup_food_options("qqqqzzzz")["status"] == "not_found"
