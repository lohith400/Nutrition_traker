"""Custom foods: dishes the user builds from their own ingredients.

Workflow (Custom foods page, and the coach's `analyze_recipe` tool):

  1. The user lists ingredients with quantities ("2 tbsp oil", "200 g paneer", "1 cup rice").
  2. Each ingredient is resolved to real nutrition data, in this order of trust:
        dataset row  ->  reference table (backend/ingredient_reference.py)  ->  AI estimate  ->  manual entry
     The AI (when configured) only *chooses* which candidate fits the dish, converts odd units
     ("1 medium onion") to grams, and supplies a flagged estimate when nothing in the data fits.
  3. Python multiplies and adds. The model never does arithmetic, same rule as the rest of the app.
  4. The result can be saved as a custom food and then logged like any other food
     (food_code "custom:<id>"), from the Food log, Overview, or by name in the coach chat.

Every line says where its numbers came from, so a guess is never presented as data.
"""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime

try:
    from backend import ingredient_reference as ref
    from backend import food_quality, memory_agent, rag_resolver
except ImportError:  # run from inside backend/
    import ingredient_reference as ref
    import food_quality, memory_agent, rag_resolver

MAX_INGREDIENTS = 40
_table_ready = False
_lock = threading.Lock()

CREATE_SQL = """CREATE TABLE IF NOT EXISTS custom_foods (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    name_key       TEXT NOT NULL UNIQUE,
    servings       REAL NOT NULL DEFAULT 1,
    serving_label  TEXT NOT NULL DEFAULT 'serving',
    total_grams    REAL,
    calories       REAL NOT NULL,
    protein_g      REAL NOT NULL,
    carbs_g        REAL NOT NULL,
    fat_g          REAL NOT NULL,
    diet_tag       TEXT,
    ingredients_json TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
)"""


def _conn():
    conn = memory_agent._get_conn()
    global _table_ready
    if not _table_ready:
        with _lock:
            if not _table_ready:
                conn.execute(CREATE_SQL)
                conn.commit()
                _table_ready = True
    return conn


def _key(name: str) -> str:
    return " ".join(str(name or "").lower().split())


def _round(v, n=1):
    return round(float(v or 0), n)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
def _row_to_food(r) -> dict:
    servings = float(r["servings"] or 1) or 1.0
    total = {"calories": r["calories"], "protein_g": r["protein_g"], "carbs_g": r["carbs_g"], "fat_g": r["fat_g"]}
    per_serv = {k: _round(v / servings) for k, v in total.items()}
    per100 = None
    if r["total_grams"]:
        per100 = {k: _round(v / r["total_grams"] * 100) for k, v in total.items()}
    try:
        ingredients = json.loads(r["ingredients_json"] or "[]")
    except ValueError:
        ingredients = []
    return {
        "id": r["id"], "food_code": f"custom:{r['id']}", "name": r["name"], "servings": servings,
        "serving_label": r["serving_label"], "total_grams": r["total_grams"],
        "totals": {k: _round(v) for k, v in total.items()}, "per_serving": per_serv, "per_100g": per100,
        "diet_tag": r["diet_tag"], "ingredients": ingredients, "notes": r["notes"] or "",
        "created_at": r["created_at"], "updated_at": r["updated_at"],
    }


def list_foods() -> list:
    conn = _conn()
    try:
        rows = conn.execute("SELECT * FROM custom_foods ORDER BY datetime(updated_at) DESC, id DESC").fetchall()
        return [_row_to_food(r) for r in rows]
    finally:
        conn.close()


def get_food(food_id: int) -> dict | None:
    conn = _conn()
    try:
        r = conn.execute("SELECT * FROM custom_foods WHERE id = ?", (int(food_id),)).fetchone()
        return _row_to_food(r) if r else None
    finally:
        conn.close()


def _clean_lines(lines) -> tuple[list, str | None]:
    """Validate saved ingredient lines and recompute their nutrition from per-100g and grams."""
    out = []
    for ln in (lines or [])[:MAX_INGREDIENTS]:
        name = " ".join(str(ln.get("name") or "").split())[:80]
        try:
            grams = float(ln.get("grams") or 0)
        except (TypeError, ValueError):
            grams = 0
        p100 = ln.get("per_100g") or {}
        if not name or grams <= 0 or grams > 20000 or not p100:
            return [], f"'{name or 'An ingredient'}' needs a weight in grams and nutrition values before it can be saved."
        try:
            p = {k: max(0.0, min(float(p100.get(k) or 0), 1000.0)) for k in ("calories", "protein_g", "carbs_g", "fat_g")}
        except (TypeError, ValueError):
            return [], f"'{name}' has invalid nutrition values."
        out.append({
            "name": name, "quantity": ln.get("quantity"), "unit": ln.get("unit"), "grams": round(grams, 1),
            "matched_to": ln.get("matched_to"), "source": ln.get("source") or "manual", "food_code": ln.get("food_code"),
            "per_100g": {k: round(v, 2) for k, v in p.items()},
            "nutrition": {k: round(v * grams / 100.0, 1) for k, v in p.items()},
        })
    if not out:
        return [], "Add at least one ingredient."
    return out, None


def _diet_for(lines: list) -> str:
    order = ["vegan", "vegetarian", "eggetarian", "non_veg"]
    worst = 0
    for ln in lines:
        tag = food_quality.diet_tag(ln.get("matched_to") or ln["name"])
        code = ln.get("food_code") or ""
        if code.startswith("ref:") and ref.get(code[4:]):
            tag = ref.get(code[4:])["diet_tag"]
        worst = max(worst, order.index(tag) if tag in order else 0)
    return order[worst]


def save(name: str, servings: float, serving_label: str, notes: str, lines: list, food_id: int | None = None) -> dict:
    name = " ".join(str(name or "").split())[:80]
    if not name:
        return {"status": "error", "error": "Give your food a name."}
    try:
        servings = float(servings)
    except (TypeError, ValueError):
        servings = 0
    if not (0 < servings <= 100):
        return {"status": "error", "error": "Servings must be between 0 and 100."}
    clean, err = _clean_lines(lines)
    if err:
        return {"status": "error", "error": err}
    totals = {k: sum(c["nutrition"][k] for c in clean) for k in ("calories", "protein_g", "carbs_g", "fat_g")}
    total_grams = round(sum(c["grams"] for c in clean), 1)
    label = (serving_label or "serving").strip()[:30] or "serving"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    try:
        clash = conn.execute("SELECT id FROM custom_foods WHERE name_key = ?", (_key(name),)).fetchone()
        if clash and clash["id"] != food_id:
            return {"status": "error", "conflict": True, "error": f"You already have a custom food called '{name}'. Pick another name, or edit that one."}
        if food_id:
            conn.execute(
                "UPDATE custom_foods SET name=?, name_key=?, servings=?, serving_label=?, total_grams=?, calories=?, protein_g=?, "
                "carbs_g=?, fat_g=?, diet_tag=?, ingredients_json=?, notes=?, updated_at=? WHERE id=?",
                (name, _key(name), servings, label, total_grams, totals["calories"], totals["protein_g"], totals["carbs_g"],
                 totals["fat_g"], _diet_for(clean), json.dumps(clean), (notes or "")[:500], now, int(food_id)),
            )
            new_id = int(food_id)
        else:
            cur = conn.execute(
                "INSERT INTO custom_foods (name, name_key, servings, serving_label, total_grams, calories, protein_g, carbs_g, fat_g, "
                "diet_tag, ingredients_json, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (name, _key(name), servings, label, total_grams, totals["calories"], totals["protein_g"], totals["carbs_g"],
                 totals["fat_g"], _diet_for(clean), json.dumps(clean), (notes or "")[:500], now, now),
            )
            new_id = cur.lastrowid
            if not new_id:
                new_id = conn.execute("SELECT id FROM custom_foods WHERE name_key = ?", (_key(name),)).fetchone()["id"]
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"status": "saved", "food": get_food(new_id)}


def delete(food_id: int) -> bool:
    conn = _conn()
    try:
        cur = conn.execute("DELETE FROM custom_foods WHERE id = ?", (int(food_id),))
        conn.commit()
        return (cur.rowcount or 0) > 0
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Search + macros (used by rag_resolver.find_candidates and math_engine)
# ---------------------------------------------------------------------------
def food_to_option(f: dict) -> dict:
    return {
        "food_code": f["food_code"], "food_name": f["name"], "source": "custom", "quality": "ok", "quality_note": None,
        "diet_tag": f["diet_tag"], "serving_label": f["serving_label"],
        "serving_grams": round(f["total_grams"] / f["servings"]) if f["total_grams"] else None,
        "per_serving": f["per_serving"], "per_100g": f["per_100g"],
    }


def search(query: str) -> list:
    toks = rag_resolver._query_tokens(query)
    if not toks:
        return []
    qset = {rag_resolver._canon(t) for t in toks}
    out = []
    for f in list_foods():
        nset = {rag_resolver._canon(w) for w in rag_resolver._words(f["name"]) if w not in rag_resolver._STOP}
        inter = len(nset & qset)
        if not inter:
            continue
        exact = nset == qset
        cov = inter / len(qset)
        if not exact and cov < 0.5:
            continue
        opt = food_to_option(f)
        opt["exact"] = exact
        opt["match"] = {"score": 170.0 if exact else round(100 * cov + 10, 1), "matched": sorted(qset & nset), "missing": sorted(qset - nset)}
        out.append(opt)
    return out


def macros_for(food_code: str, quantity: float, unit: str) -> dict:
    """Same result shape as math_engine.calculate_meal_macros, for 'custom:<id>' and 'ref:<key>' codes."""
    if food_code.startswith("custom:"):
        try:
            f = get_food(int(food_code.split(":", 1)[1]))
        except ValueError:
            f = None
        if not f:
            return {"error": f"Unknown custom food: {food_code}"}
        name = f["name"]
        per_serv, per100, label = f["per_serving"], f["per_100g"], f["serving_label"]
    elif food_code.startswith("ref:"):
        entry = ref.get(food_code[4:])
        if not entry:
            return {"error": f"Unknown food: {food_code}"}
        opt = ref.option_for(entry)
        name, per_serv, per100, label = opt["food_name"], opt["per_serving"], opt["per_100g"], opt["serving_label"]
    else:
        return {"error": f"Unknown food_code: {food_code}"}

    if unit == "serving":
        if not per_serv:
            return {"error": f"'{name}' has no standard serving size. Please log it by weight in grams instead.",
                    "food_name": name, "quality": "ok", "fallback_unit": "grams"}
        base, lab = per_serv, label
        scale = quantity
    else:
        if not per100:
            return {"error": f"No per-100g nutrition for '{name}'.", "food_name": name}
        base, lab = per100, f"{quantity:g}g"
        scale = quantity / 100.0
    result = {
        "food_code": food_code, "food_name": name, "quantity": quantity, "unit": unit, "serving_label": lab,
        "calories": round(base["calories"] * scale, 1), "protein_g": round(base["protein_g"] * scale, 1),
        "carbs_g": round(base["carbs_g"] * scale, 1), "fat_g": round(base["fat_g"] * scale, 1), "quality": "ok",
    }
    if food_code.startswith("ref:") and ref.get(food_code[4:]).get("note"):
        result["note"] = ref.get(food_code[4:])["note"]
    return result


def option_by_code(code: str) -> dict | None:
    if not code:
        return None
    if code.startswith("ref:"):
        e = ref.get(code[4:])
        return ref.option_for(e) if e else None
    if code.startswith("custom:"):
        try:
            f = get_food(int(code.split(":", 1)[1]))
        except ValueError:
            return None
        return food_to_option(f) if f else None
    conn = memory_agent._get_conn()
    try:
        r = conn.execute(
            "SELECT food_code, food_name, quality, quality_note, diet_tag, serving_grams, servings_unit, energy_kcal_100g, protein_g_100g, "
            "carb_g_100g, fat_g_100g, fibre_g_100g, unit_serving_energy_kcal, unit_serving_protein_g, unit_serving_carb_g, "
            "unit_serving_fat_g FROM food_items WHERE food_code = ?", (code,),
        ).fetchone()
    finally:
        conn.close()
    return rag_resolver.food_row_to_option(dict(r)) if r else None


# ---------------------------------------------------------------------------
# Ingredient analysis
# ---------------------------------------------------------------------------
_SANE = {"calories": (0, 900), "protein_g": (0, 100), "carbs_g": (0, 100), "fat_g": (0, 100)}


def _sane_estimate(est) -> dict | None:
    """Accept an AI per-100g estimate only if it is physically plausible."""
    if not isinstance(est, dict):
        return None
    try:
        vals = {k: float(est.get(k)) for k in _SANE}
    except (TypeError, ValueError):
        return None
    for k, (lo, hi) in _SANE.items():
        if not (lo <= vals[k] <= hi):
            return None
    if vals["protein_g"] + vals["carbs_g"] + vals["fat_g"] > 105:
        return None
    atwater = 4 * vals["protein_g"] + 4 * vals["carbs_g"] + 9 * vals["fat_g"]
    if vals["calories"] > 0 and abs(atwater - vals["calories"]) > 30 and abs(atwater - vals["calories"]) / vals["calories"] > 0.4:
        return None
    return {k: round(v, 2) for k, v in vals.items()}


def _brief(opt: dict) -> dict:
    p = opt.get("per_100g") or {}
    return {"code": opt["food_code"], "name": opt["food_name"], "source": opt["source"],
            "kcal_100g": p.get("calories"), "protein_100g": p.get("protein_g"), "carbs_100g": p.get("carbs_g"), "fat_100g": p.get("fat_g")}


def _alt(opt: dict) -> dict:
    return {"food_code": opt["food_code"], "food_name": opt["food_name"], "source": opt["source"], "per_100g": opt.get("per_100g"),
            "serving_label": opt.get("serving_label"), "quality": opt.get("quality"), "note": opt.get("quality_note")}


def _parse_json(text: str):
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.I | re.M).strip()
    for opener, closer in (("{", "}"), ("[", "]")):
        a, b = text.find(opener), text.rfind(closer)
        if a != -1 and b > a:
            try:
                return json.loads(text[a:b + 1])
            except ValueError:
                continue
    return None


def _ai_client():
    try:
        try:
            from backend import orchestrator, llm_config
        except ImportError:
            import orchestrator, llm_config
        if orchestrator.client is None:
            return None
        return orchestrator.client, orchestrator.MODEL, llm_config
    except Exception:
        return None


def _ai_resolve(dish: str, items: list) -> dict:
    """One model call: choose among candidates, convert odd units to grams, estimate what's missing. Returns {i: dict}."""
    ai = _ai_client()
    if not ai or not items:
        return {}
    client, model, llm_config = ai
    payload = {"dish": dish or "unnamed dish", "ingredients": items}
    system = (
        "You help build an accurate nutrition entry for a home-cooked Indian dish. You are given a dish name and ingredient lines, each "
        "with candidate foods from a trusted database. For EVERY ingredient return one object. Rules:\n"
        "- pick_code: the candidate code that best fits the ingredient as it is used in THIS dish (judge raw vs cooked from the dish and "
        "unit; 'rice' in a biryani recipe is usually raw rice, 'rice' eaten from a plate is cooked). Use null if no candidate fits.\n"
        "- If pick_code is null, give estimate_per_100g with calories, protein_g, carbs_g, fat_g for the ingredient (typical values). "
        "Only estimate when you are reasonably sure.\n"
        "- If needs_grams is true, give grams for the stated quantity and unit (e.g. 1 medium onion = 110, 1 tbsp ghee = 14). Otherwise grams null.\n"
        "- Never add numbers up or output totals. Output ONLY JSON: "
        "{\"items\":[{\"i\":0,\"pick_code\":\"...\"|null,\"grams\":number|null,\"estimate_per_100g\":{\"calories\":0,\"protein_g\":0,\"carbs_g\":0,\"fat_g\":0}|null,"
        "\"basis\":\"raw|cooked|as sold\",\"reason\":\"max 12 words\"}]}"
    )
    try:
        resp = llm_config.create_completion(
            client, model=model, temperature=0,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload)}],
        )
        data = _parse_json(resp.choices[0].message.content or "")
    except Exception:
        return {}
    rows = data.get("items") if isinstance(data, dict) else data
    out = {}
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and isinstance(row.get("i"), int):
            out[row["i"]] = row
    return out


def _pct(t: dict) -> dict:
    kcal = 4 * t["protein_g"] + 4 * t["carbs_g"] + 9 * t["fat_g"]
    if kcal <= 0:
        return {"protein": 0, "carbs": 0, "fat": 0}
    return {"protein": round(4 * t["protein_g"] / kcal * 100), "carbs": round(4 * t["carbs_g"] / kcal * 100), "fat": round(9 * t["fat_g"] / kcal * 100)}


def _blank_line(idx: int, iname: str, qty: float, unit: str) -> dict:
    return {"index": idx, "name": iname, "quantity": qty, "unit": unit, "status": "needs_input", "source": None, "matched_to": None,
            "food_code": None, "per_100g": None, "grams": None, "grams_note": None, "grams_estimated": False,
            "nutrition": None, "alternatives": [], "note": None, "reason": None, "basis": None, "ai_checked": False}


def _apply_option(line: dict, opt: dict) -> None:
    line.update(source=opt["source"], food_code=opt["food_code"], matched_to=opt["food_name"],
                per_100g={k: round(v, 2) for k, v in opt["per_100g"].items()}, status="matched", note=opt.get("quality_note"))
    if opt.get("quality") == "unreliable":
        line["note"] = "The dataset flags this row as unreliable. Consider another match."


def analyze(name: str, servings: float, ingredients: list, use_ai: bool = True) -> dict:
    """Resolve every ingredient to nutrition, then add up. See module docstring."""
    if not ingredients:
        return {"status": "error", "error": "Add at least one ingredient."}
    ingredients = ingredients[:MAX_INGREDIENTS]
    try:
        servings = float(servings or 1)
    except (TypeError, ValueError):
        servings = 1.0
    servings = min(max(servings, 0.25), 100.0)

    lines, ai_items, default_density = [], [], {}
    for idx, ing in enumerate(ingredients):
        iname = " ".join(str(ing.get("name") or "").split())[:80]
        try:
            qty = float(ing.get("quantity") or 0)
        except (TypeError, ValueError):
            qty = 0
        unit = str(ing.get("unit") or "g").strip().lower()
        line = _blank_line(idx, iname, qty, unit)
        lines.append(line)
        if not iname:
            line["note"] = "Type an ingredient name."
            continue

        # 1) which food does this ingredient mean?  user's choice > own values > best automatic match
        cands = rag_resolver.find_candidates(iname, diet="any", limit=6)
        refhit = ref.best_for_ingredient(iname)
        pool = list(cands)
        if refhit and all(c["food_code"] != refhit["food_code"] for c in pool):
            pool.insert(0, refhit)
        line["alternatives"] = [_alt(c) for c in pool[:6]]

        user_pick = option_by_code(str(ing["food_code"])) if ing.get("food_code") else None
        manual = _sane_estimate({k: (ing.get("per_100g") or {}).get(k, 0) for k in _SANE}) if isinstance(ing.get("per_100g"), dict) else None
        if user_pick and user_pick.get("per_100g"):
            _apply_option(line, user_pick)
        elif manual:
            line.update(source="manual", per_100g=manual, matched_to="Your own values", status="matched")
        else:
            top = cands[0] if cands else None
            auto = top if (top and top.get("exact")) else refhit
            if auto and auto.get("per_100g"):
                _apply_option(line, auto)

        # 2) how many grams?
        entry = ref.get((line["food_code"] or "")[4:]) if (line["food_code"] or "").startswith("ref:") else (ref.get(refhit["food_code"][4:]) if refhit else None)
        try:
            manual_g = float(ing.get("grams")) if ing.get("grams") not in (None, "") else 0.0
        except (TypeError, ValueError):
            manual_g = 0.0
        if manual_g > 0:
            line["grams"], line["grams_note"] = round(manual_g, 1), "entered by you"
        elif qty > 0:
            g, est, how = ref.grams_for(entry, qty, unit)
            line["grams"], line["grams_estimated"], line["grams_note"] = g, est, how
            default_density[idx] = unit in ref.VOLUME_ML and (entry is None or entry.get("density") is None)

        if use_ai and line["source"] != "manual" and not user_pick:
            ai_items.append({"i": idx, "name": iname, "quantity": qty, "unit": unit,
                             "needs_grams": bool(manual_g <= 0 and (line["grams"] is None or default_density.get(idx))),
                             "auto_pick": line["food_code"], "candidates": [_brief(c) for c in pool[:6]]})

    # 3) one AI pass over the ingredients: confirm/choose the match, convert odd units, estimate what is missing
    used_ai = False
    if ai_items:
        verdicts = _ai_resolve(name, ai_items)
        used_ai = bool(verdicts)
        for it in ai_items:
            v, line = verdicts.get(it["i"]), lines[it["i"]]
            if not v:
                continue
            code = v.get("pick_code")
            if code in {c["code"] for c in it["candidates"]}:
                opt = option_by_code(code)
                if opt and opt.get("per_100g"):
                    _apply_option(line, opt)
                    line["ai_checked"] = True
            elif code is None and line["source"] is None:
                est = _sane_estimate(v.get("estimate_per_100g"))
                if est:
                    line.update(source="ai_estimate", per_100g=est, status="estimated", food_code=None,
                                matched_to="AI estimate" + (f" ({v['basis']})" if v.get("basis") else ""),
                                note="Not in the database, so typical values were estimated by the AI. Check them against a label if you can.")
            if v.get("reason"):
                line["reason"] = str(v["reason"])[:120]
            if v.get("basis"):
                line["basis"] = str(v["basis"])[:20]
            if it["needs_grams"]:
                try:
                    g = float(v.get("grams"))
                except (TypeError, ValueError):
                    g = 0.0
                if 0 < g <= 5000:
                    line["grams"], line["grams_estimated"], line["grams_note"] = round(g, 1), True, "AI estimate for this unit"

    # 4) arithmetic (Python only)
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    grams_total, unresolved, any_estimate = 0.0, [], False
    for line in lines:
        if line["per_100g"] and line["grams"]:
            line["nutrition"] = {k: round(line["per_100g"][k] * line["grams"] / 100.0, 1) for k in totals}
            for k in totals:
                totals[k] += line["per_100g"][k] * line["grams"] / 100.0
            grams_total += line["grams"]
            any_estimate = any_estimate or line["source"] == "ai_estimate"
        else:
            line["status"] = "needs_input"
            unresolved.append(line["name"] or f"ingredient {line['index'] + 1}")
            if not line["note"]:
                line["note"] = "Pick a match or enter per-100g values." if not line["per_100g"] else "Enter the weight in grams."
    totals = {k: round(v, 1) for k, v in totals.items()}
    per_serv = {k: round(v / servings, 1) for k, v in totals.items()}
    per100 = {k: round(v / grams_total * 100, 1) for k, v in totals.items()} if grams_total else None
    warnings = []
    if unresolved:
        warnings.append("Totals leave out: " + ", ".join(unresolved) + ".")
    if any_estimate:
        warnings.append("Some values are AI estimates, not database values.")
    if any(l["grams_estimated"] for l in lines if l["grams"]):
        warnings.append("Weights marked ≈ are converted from cups, spoons or pieces and are approximate.")

    result = {
        "status": "ok", "name": name, "servings": servings, "used_ai": used_ai, "ingredients": lines, "totals": totals,
        "per_serving": per_serv, "per_100g": per100, "total_grams": round(grams_total, 1), "macro_pct": _pct(totals),
        "unresolved": unresolved, "warnings": warnings, "complete": not unresolved,
    }
    result["summary"] = _summary(result)
    if use_ai and not unresolved and used_ai:
        result["coach_note"] = _coach_note(result)
    return result


def _budget():
    try:
        try:
            from backend import math_engine
        except ImportError:
            import math_engine
        b = math_engine.get_remaining_budget_today(datetime.now().strftime("%Y-%m-%d"))
        return None if "error" in b else b
    except Exception:
        return None


def _summary(r: dict) -> str:
    ps, pct = r["per_serving"], r["macro_pct"]
    bits = [f"One serving is about {round(ps['calories'])} kcal with {ps['protein_g']} g protein, {ps['carbs_g']} g carbs and {ps['fat_g']} g fat."]
    prof = memory_agent.get_user_profile()
    if prof and prof.get("target_calories"):
        share = ps["calories"] / prof["target_calories"] * 100
        pshare = ps["protein_g"] / prof["target_protein_g"] * 100 if prof.get("target_protein_g") else 0
        bits.append(f"That is {round(share)}% of your daily calories and {round(pshare)}% of your daily protein.")
    if ps["calories"] > 0:
        density = ps["protein_g"] / ps["calories"] * 100
        if density >= 8:
            bits.append("It is protein-dense for its calories.")
        elif pct["fat"] >= 50:
            bits.append(f"{pct['fat']}% of its calories come from fat, mostly from oil, ghee, nuts or dairy in the recipe.")
        elif pct["carbs"] >= 65:
            bits.append(f"It is carb-heavy ({pct['carbs']}% of calories). Pair it with a protein source.")
    return " ".join(bits)


def _coach_note(r: dict) -> str | None:
    ai = _ai_client()
    if not ai:
        return None
    client, model, llm_config = ai
    prof = memory_agent.get_user_profile() or {}
    b = _budget()
    ctx = {
        "dish": r["name"], "servings": r["servings"], "per_serving": r["per_serving"], "macro_percent_of_calories": r["macro_pct"],
        "goal": prof.get("goal"), "diet": prof.get("diet"), "daily_targets": {k: prof.get(k) for k in ("target_calories", "target_protein_g")},
        "remaining_today": {"calories": b["remaining_calories"], "protein_g": b["remaining_protein_g"]} if b else None,
        "ingredients": [{"name": l["name"], "grams": l["grams"], "kcal": (l["nutrition"] or {}).get("calories")} for l in r["ingredients"]],
    }
    try:
        resp = llm_config.create_completion(
            client, model=model, temperature=0.3,
            messages=[
                {"role": "system", "content": "You are a warm, concise Indian nutrition coach. Write 2-3 sentences about this dish for this person: what stands out "
                 "(protein, calories, which ingredient drives the calories) and one practical tweak or a way to fit it into today. Use ONLY the numbers given; never invent "
                 "or recompute any. No medical claims, no markdown."},
                {"role": "user", "content": json.dumps(ctx, default=str)},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        return text[:600] or None
    except Exception:
        return None
