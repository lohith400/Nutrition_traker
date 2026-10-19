"""Unit tests for backend/grocery.py pantry management."""
import pytest
import sqlite3
from backend import grocery, memory_agent


@pytest.fixture
def grocery_db(tmp_path, monkeypatch):
    """Provide an isolated database for grocery tests."""
    db_file = str(tmp_path / "grocery_test.db")
    monkeypatch.setattr(memory_agent, "DB_PATH", db_file)
    monkeypatch.setattr(grocery, "_grocery_table_ensured", False)
    return db_file


def test_unit_normalization_and_formatting():
    assert grocery.normalize_unit("kg") == "kg"
    assert grocery.normalize_unit("KGS") == "kg"
    assert grocery.normalize_unit("kilos") == "kg"
    assert grocery.normalize_unit("grams") == "g"
    assert grocery.normalize_unit("gm") == "g"
    assert grocery.normalize_unit("liter") == "l"
    assert grocery.normalize_unit("ltr") == "l"
    assert grocery.normalize_unit("nos") == "pcs"
    assert grocery.normalize_unit("") == "pcs"
    assert grocery.normalize_unit("cups") == "cups"

    assert grocery._fmt(2.0, "kg") == "2 kg"
    assert grocery._fmt(1.5, "l") == "1.5 l"


def test_string_helpers():
    assert grocery._display_name("brown rice") == "Brown rice"
    assert grocery._display_name("  rolled   oats  ") == "Rolled oats"
    assert grocery._display_name("") == ""

    assert grocery._singular("tomatoes") == "tomato"
    assert grocery._singular("cherries") == "cherry"
    assert grocery._singular("onions") == "onion"
    assert grocery._singular("glass") == "glass"

    assert grocery._key("Organic Rolled Oats") == "organic rolled oat"


def test_convert_qty():
    # Same unit
    assert grocery._convert_qty(5.0, "kg", "kg") == 5.0
    # Weight conversion
    assert grocery._convert_qty(1.5, "kg", "g") == 1500.0
    assert grocery._convert_qty(500, "g", "kg") == 0.5
    # Volume conversion
    assert grocery._convert_qty(2.0, "l", "ml") == 2000.0
    assert grocery._convert_qty(250, "ml", "l") == 0.25
    # Incompatible conversion
    assert grocery._convert_qty(1.0, "kg", "l") is None
    assert grocery._convert_qty(1.0, "pcs", "kg") is None


def test_add_and_list_items(grocery_db):
    res = grocery.add_item("Basmati Rice", 2, "kg")
    assert res["status"] == "ok"
    assert res["name"] == "Basmati Rice"
    assert res["now_have"] == "2 kg"

    # Add same item with compatible unit (g -> kg)
    res2 = grocery.add_item("basmati rice", 500, "g")
    assert res2["status"] == "ok"
    assert res2["now_have"] == "2.5 kg"

    items = grocery.list_items()
    assert len(items) == 1
    assert items[0]["name"] == "Basmati Rice"
    assert items[0]["quantity"] == 2.5
    assert items[0]["unit"] == "kg"


def test_add_item_validation(grocery_db):
    assert grocery.add_item("", 1)["status"] == "error"
    assert grocery.add_item("Rice", "invalid_num")["status"] == "error"
    assert grocery.add_item("Rice", -5)["status"] == "error"


def test_add_items_batch(grocery_db):
    batch = [
        {"name": "Milk", "quantity": 1, "unit": "l"},
        {"name": "Eggs", "quantity": 6, "unit": "pcs"},
        {"name": "", "quantity": 1},  # invalid
    ]
    res = grocery.add_items(batch)
    assert res["status"] == "ok"
    assert len(res["items"]) == 2
    assert "skipped" in res


def test_update_and_delete_item(grocery_db):
    res = grocery.add_item("Curd", 500, "g")
    item_id = res["id"]

    # Update quantity
    upd = grocery.update_item(item_id, quantity=1000)
    assert upd["status"] == "ok"

    # Verify update
    found = grocery.find_item("curd")
    assert found is not None
    assert found["quantity"] == 1000

    # Delete item
    del_res = grocery.delete_item(item_id)
    assert del_res["status"] == "removed"
    assert grocery.find_item("curd") is None


def test_remove_items(grocery_db):
    grocery.add_item("Onions", 2, "kg")
    grocery.add_item("Potatoes", 5, "pcs")

    # Subtract partial quantity
    rem = grocery.remove_items([{"name": "Onion", "quantity": 500, "unit": "g"}])
    assert rem["status"] == "ok"
    assert len(rem["items"]) == 1
    assert rem["items"][0]["now_have"] == "1.5 kg"

    # Remove item entirely without quantity
    rem_all = grocery.remove_items([{"name": "Potatoes"}])
    assert rem_all["status"] == "ok"
    assert len(rem_all["items"]) == 1
    assert rem_all["items"][0]["removed"] == "all"
    assert grocery.find_item("potatoes") is None

    # Missing item
    rem_missing = grocery.remove_items([{"name": "Dragonfruit"}])
    assert rem_missing["status"] == "error"
    assert "Dragonfruit" in rem_missing["error"]


def test_grams_available():
    assert grocery.grams_available({"quantity": 2, "unit": "kg"}) == 2000.0
    assert grocery.grams_available({"quantity": 500, "unit": "g"}) == 500.0
    assert grocery.grams_available({"quantity": 1, "unit": "l"}) == 1000.0
    assert grocery.grams_available({"quantity": 6, "unit": "pcs"}) is None

