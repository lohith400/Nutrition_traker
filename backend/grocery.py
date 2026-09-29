"""Grocery list (pantry) -- what the user has at home.

Kept completely separate from the food log and from the normal meal
suggestions. The coach only reads this list when the user explicitly asks for a
meal made from what they have at home; it can also add/remove items when the
user says so ("add 1 kg rice"). The Grocery page uses the same functions.
"""
from datetime import datetime

try:
    from backend import memory_agent
except ImportError:
    import memory_agent

# Units shown in the UI; anything else the user says is kept as typed.
UNITS = ["kg", "g", "l", "ml", "pcs", "pack", "dozen", "bunch"]
_ALIASES = {
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g", "grm": "g",
    "l": "l", "lt": "l", "ltr": "l", "ltrs": "l", "litre": "l", "litres": "l", "liter": "l", "liters": "l",
    "ml": "ml", "millilitre": "ml", "millilitres": "ml", "milliliter": "ml", "milliliters": "ml",
    "": "pcs", "pc": "pcs", "pcs": "pcs", "piece": "pcs", "pieces": "pcs", "nos": "pcs", "no": "pcs",
    "count": "pcs", "unit": "pcs", "units": "pcs",
    "pack": "pack", "packs": "pack", "packet": "pack", "packets": "pack",
    "dozen": "dozen", "dozens": "dozen", "bunch": "bunch", "bunches": "bunch",
}
# unit -> (group, factor to the group's base unit: grams for weight, ml for volume)
_CONVERT = {"kg": ("weight", 1000.0), "g": ("weight", 1.0), "l": ("volume", 1000.0), "ml": ("volume", 1.0)}


def normalize_unit(unit) -> str:
    u = str(unit or "").strip().lower().rstrip(".")
    return _ALIASES.get(u, u or "pcs")


def _display_name(name: str) -> str:
    name = " ".join(str(name or "").split())
    return name[:1].upper() + name[1:] if name else ""


def _singular(word: str) -> str:
    w = word.lower().strip()
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("oes") and len(w) > 4:
        return w[:-2]
    if w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return w[:-1]
    return w


def _key(name: str) -> str:
    return " ".join(_singular(w) for w in str(name or "").lower().split())


def _ensure_table(conn) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS grocery_items (
               id         INTEGER PRIMARY KEY AUTOINCREMENT,
               name       TEXT NOT NULL,
               name_key   TEXT NOT NULL,
               quantity   REAL NOT NULL,
               unit       TEXT NOT NULL,
               added_at   TEXT NOT NULL,
               updated_at TEXT NOT NULL
           )"""
    )


def _clean_qty(q: float) -> float:
    return round(float(q), 3)


def _fmt(q: float, unit: str) -> str:
    q = _clean_qty(q)
    txt = str(int(q)) if q == int(q) else str(q)
    return f"{txt} {unit}".strip()


def _convert_qty(qty: float, from_unit: str, to_unit: str):
    """Returns qty expressed in to_unit, or None when the units can't be converted."""
    if from_unit == to_unit:
        return qty
    a, b = _CONVERT.get(from_unit), _CONVERT.get(to_unit)
    if a and b and a[0] == b[0]:
        return qty * a[1] / b[1]
    return None


def _row(r) -> dict:
    return {"id": r["id"], "name": r["name"], "quantity": r["quantity"], "unit": r["unit"],
            "added_at": r["added_at"], "updated_at": r["updated_at"]}


def list_items() -> list:
    conn = memory_agent._get_conn()
    _ensure_table(conn)
    rows = conn.execute("SELECT * FROM grocery_items ORDER BY LOWER(name) ASC, unit ASC").fetchall()
    conn.close()
    return [_row(r) for r in rows]


def add_item(name: str, quantity: float = 1, unit: str = "pcs") -> dict:
    name = _display_name(name)
    if not name:
        return {"status": "error", "error": "Item name is required."}
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return {"status": "error", "error": f"'{quantity}' is not a valid quantity."}
    if quantity <= 0:
        return {"status": "error", "error": "Quantity must be more than 0."}
    unit = normalize_unit(unit)
    key = _key(name)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = memory_agent._get_conn()
    _ensure_table(conn)
    existing = conn.execute("SELECT * FROM grocery_items WHERE name_key = ?", (key,)).fetchall()
    target, new_qty = None, quantity
    for r in existing:
        converted = _convert_qty(quantity, unit, r["unit"])
        if converted is not None:
            target, new_qty = r, r["quantity"] + converted
            break
    if target is not None:
        conn.execute("UPDATE grocery_items SET quantity = ?, updated_at = ? WHERE id = ?",
                     (_clean_qty(new_qty), now, target["id"]))
        item_id, shown_unit, total = target["id"], target["unit"], new_qty
    else:
        cur = conn.execute(
            "INSERT INTO grocery_items (name, name_key, quantity, unit, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (name, key, _clean_qty(quantity), unit, now, now))
        item_id, shown_unit, total = cur.lastrowid, unit, quantity
    conn.commit()
    conn.close()
    return {"status": "ok", "id": item_id, "name": name, "added": _fmt(quantity, unit), "now_have": _fmt(total, shown_unit)}


def add_items(items: list) -> dict:
    results = [add_item(i.get("name", ""), i.get("quantity", 1) or 1, i.get("unit", "")) for i in (items or [])]
    ok = [r for r in results if r.get("status") == "ok"]
    errors = [r.get("error") for r in results if r.get("status") != "ok"]
    if not ok:
        return {"status": "error", "error": "; ".join(e for e in errors if e) or "Nothing to add."}
    out = {"status": "ok", "items": [{"name": r["name"], "added": r["added"], "now_have": r["now_have"]} for r in ok]}
    if errors:
        out["skipped"] = errors
    return out


def update_item(item_id: int, quantity=None, unit=None, name=None) -> dict:
    conn = memory_agent._get_conn()
    _ensure_table(conn)
    row = conn.execute("SELECT * FROM grocery_items WHERE id = ?", (item_id,)).fetchone()
    if not row:
        conn.close()
        return {"status": "error", "error": "Item not found."}
    new_qty = row["quantity"] if quantity is None else float(quantity)
    if new_qty <= 0:
        conn.execute("DELETE FROM grocery_items WHERE id = ?", (item_id,))
        conn.commit()
        conn.close()
        return {"status": "removed", "id": item_id}
    new_unit = row["unit"] if unit is None else normalize_unit(unit)
    new_name = row["name"] if name is None else _display_name(name)
    if not new_name:
        conn.close()
        return {"status": "error", "error": "Item name is required."}
    conn.execute("UPDATE grocery_items SET name = ?, name_key = ?, quantity = ?, unit = ?, updated_at = ? WHERE id = ?",
                 (new_name, _key(new_name), _clean_qty(new_qty), new_unit, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), item_id))
    conn.commit()
    conn.close()
    return {"status": "ok", "id": item_id}


def delete_item(item_id: int) -> dict:
    conn = memory_agent._get_conn()
    _ensure_table(conn)
    cur = conn.execute("DELETE FROM grocery_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"status": "removed" if cur.rowcount else "error", **({} if cur.rowcount else {"error": "Item not found."})}


def find_item(name: str):
    """Best match for a spoken/typed name: exact (singular-insensitive) first, then the closest partial match."""
    key = _key(name)
    if not key:
        return None
    items = list_items()
    for i in items:
        if _key(i["name"]) == key:
            return i
    partial = [i for i in items if len(key) >= 3 and (key in _key(i["name"]) or _key(i["name"]) in key)]
    if partial:
        partial.sort(key=lambda i: abs(len(_key(i["name"])) - len(key)))
        return partial[0]
    return None


def remove_items(items: list) -> dict:
    """Each entry: {name, quantity?, unit?}. No quantity = remove the item entirely."""
    done, missing = [], []
    for entry in (items or []):
        found = find_item(entry.get("name", ""))
        if not found:
            missing.append(entry.get("name", ""))
            continue
        qty = entry.get("quantity")
        if qty in (None, "", 0):
            delete_item(found["id"])
            done.append({"name": found["name"], "removed": "all", "now_have": "none"})
            continue
        unit = normalize_unit(entry.get("unit") or found["unit"])
        converted = _convert_qty(float(qty), unit, found["unit"])
        if converted is None:
            missing.append(f"{found['name']} (can't subtract {unit} from {found['unit']})")
            continue
        left = found["quantity"] - converted
        if left <= 0:
            delete_item(found["id"])
            done.append({"name": found["name"], "removed": _fmt(qty, unit), "now_have": "none"})
        else:
            update_item(found["id"], quantity=left)
            done.append({"name": found["name"], "removed": _fmt(qty, unit), "now_have": _fmt(left, found["unit"])})
    if not done:
        return {"status": "error", "error": "Not on the grocery list: " + ", ".join(m for m in missing if m)}
    out = {"status": "ok", "items": done}
    if missing:
        out["not_found"] = missing
    return out


def grams_available(item: dict):
    """Stock of an item in grams (or ml for volumes), or None when it is counted in pieces/packs."""
    conv = _CONVERT.get(item["unit"])
    return item["quantity"] * conv[1] if conv else None