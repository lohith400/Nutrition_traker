"""
RAG / Portion Resolver Agent
=============================
Job: turn a vague, colloquial food name ("thatte idli", "single vade")
into the exact matching row in the real Indian food database.

For a portfolio project this uses lightweight lexical similarity
(difflib, built into Python -- no extra install needed) rather than a
full vector-embedding search. This is a legitimate, explainable form of
retrieval for structured tabular data, and it's honestly documented here
as a "future work: swap in embeddings for semantic search" upgrade path,
not pretended to be something it isn't.

Quality-aware matching: food_items.quality (set by food_quality.assess in
db_setup) grades each row as 'ok' / 'grams_only' / 'unreliable'. Matching
prefers 'ok' rows first, then 'grams_only', and only reaches for
'unreliable' rows as an absolute last resort -- with the caller always told
which grade it got, so a bad source row is never silently presented as fact.
"""

import sqlite3

try:
    from backend.database import get_db_connection
except ImportError:  # run from inside backend/
    from database import get_db_connection
import os
import difflib

try:
    from backend import food_quality
except ImportError:
    import food_quality

_DEFAULT_DB = (
    os.path.join(os.path.dirname(__file__), "..", "nutrisync.db")
    if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "nutrisync.db"))
    else os.path.join(os.path.dirname(__file__), "nutrisync.db")
)
DB_PATH = os.getenv("NUTRISYNC_DB_PATH", _DEFAULT_DB)

# Common colloquial food names that don't lexically match the database's
# formal names well. This alias map is the practical fix real RAG systems
# use too: a small curated synonym layer on top of similarity search.
ALIASES = {
    "thatte idli": "idli",
    "idly": "idli",
    "vade": "vada",
    "uddina vade": "masala vada",
    "medu vade": "medu vada",
    "chai": "tea",
    "curd rice": "curd rice",
    "sambhar": "sambar",
    "curd": "curd rice",
    "plain curd": "curd rice",
    "yogurt": "curd rice",
    "roti": "chapati/roti",
    "chapati": "chapati/roti",
    "paneer kurma": "paneer curry",
    "kurma": "curry",
    "korma": "curry",
}

# Quality grades in preference order: try 'ok' rows first, then widen.
_QUALITY_RANK = {"ok": 0, "grams_only": 1, "unreliable": 2}


def _get_conn():
    conn = get_db_connection(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _rank_key(row, query_len):
    """Prefer good-quality data, then the shortest/most literal name match."""
    return (_QUALITY_RANK.get(row["quality"], 1), len(row["food_name"]))


def resolve_food(item_name: str, diet: str = "any") -> dict:
    """
    Given a raw item name, find the best-matching food_items row.

    `diet` restricts candidates to that diet's allowed tags (see
    food_quality.allowed_diet_tags) so a vegetarian user is never matched to
    a chicken dish just because the words happened to overlap.

    Matching order:
      1. Alias lookup (colloquial -> canonical term)
      2. Substring match: does any food_name contain the query word?
         Among matches, prefer good data quality, then the shortest name.
      3. Fuzzy lexical similarity (difflib) as a last resort, with a high
         cutoff so it doesn't return confidently-wrong matches; same
         quality preference applied.
    Returns status 'matched' | 'not_found' | 'diet_mismatch' (a match exists
    but only in food types excluded by the user's diet).
    """
    # Step 0: an exact name (dataset or one of the user's own custom foods) beats every heuristic below.
    try:
        exact = next((c for c in find_candidates(item_name, diet=diet, limit=12) if c.get("exact")), None)
    except Exception:
        exact = None
    if exact:
        pool = [{"food_code": exact["food_code"], "food_name": exact["food_name"]}]
        row = {
            "food_code": exact["food_code"], "food_name": exact["food_name"], "quality": exact["quality"],
            "quality_note": exact.get("quality_note"), "servings_unit": exact.get("serving_label"),
            "serving_grams": exact.get("serving_grams"),
        }
        return _matched(item_name, row, 1.0, "exact", pool, row)

    query = item_name.lower().strip()
    query = ALIASES.get(query, query)
    allowed = food_quality.allowed_diet_tags(diet)

    conn = _get_conn()
    try:
        all_rows = conn.execute(
            "SELECT food_code, food_name, quality, quality_note, diet_tag, serving_grams, servings_unit "
            "FROM food_items"
        ).fetchall()
    finally:
        conn.close()

    def in_diet(r):
        return (r["diet_tag"] or "vegetarian") in allowed

    # --- Step 1: substring match ---
    substring_hits = [r for r in all_rows if query in r["food_name"].lower()]
    diet_hits = [r for r in substring_hits if in_diet(r)]

    if diet_hits:
        best = min(diet_hits, key=lambda r: _rank_key(r, len(query)))
        confidence = len(query) / len(best["food_name"].lower())
        return _matched(item_name, best, min(confidence, 1.0), "substring", diet_hits, best)

    if substring_hits and not diet_hits:
        return {"status": "diet_mismatch", "query": item_name, "diet": food_quality.normalize_diet(diet)}

    # --- Step 2: fuzzy fallback, high cutoff to avoid false positives ---
    candidates = [r for r in all_rows if in_diet(r)]
    name_list = [r["food_name"] for r in candidates]
    close = difflib.get_close_matches(query, [n.lower() for n in name_list], n=8, cutoff=0.75)
    if not close:
        return {"status": "not_found", "query": item_name}

    fuzzy_rows = [next(r for r in candidates if r["food_name"].lower() == m) for m in close]
    best = min(fuzzy_rows, key=lambda r: _rank_key(r, len(query)))
    confidence = difflib.SequenceMatcher(None, query, best["food_name"].lower()).ratio()
    return _matched(item_name, best, confidence, "fuzzy", fuzzy_rows, best)


def _matched(item_name, best, confidence, method, pool, exclude_row) -> dict:
    return {
        "status": "matched",
        "query": item_name,
        "matched_food_code": best["food_code"],
        "matched_food_name": best["food_name"],
        "confidence": round(confidence, 2),
        "match_method": method,
        "quality": best["quality"],
        "quality_note": best["quality_note"],
        "servings_unit": best["servings_unit"],
        "serving_grams": best["serving_grams"],
        "alternatives": [r["food_name"] for r in pool if r["food_code"] != exclude_row["food_code"]][:3],
    }


def search_foods(query: str, diet: str = "any", limit: int = 8) -> list:
    """Plain substring search returning multiple candidates (for a
    disambiguation UI / 'did you mean' list), quality-and-diet filtered."""
    q = query.lower().strip()
    allowed = food_quality.allowed_diet_tags(diet)
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT food_code, food_name, quality, diet_tag, servings_unit, serving_grams "
            "FROM food_items WHERE lower(food_name) LIKE ?",
            (f"%{q}%",),
        ).fetchall()
    finally:
        conn.close()
    rows = [r for r in rows if (r["diet_tag"] or "vegetarian") in allowed]
    rows.sort(key=lambda r: _rank_key(r, len(q)))
    return [dict(r) for r in rows[:limit]]


# ---------------------------------------------------------------------------
# Related-food search (word based) -- powers the "which one did you mean?" options
# ---------------------------------------------------------------------------
# The old matcher used raw substring search, which is both too eager ("tea" matches
# "gateau", "chicken biryani" fuzzy-matched "Chicken yakhni") and too strict (nothing
# for "brown bread"). This one compares whole words, understands common Indian
# spellings/synonyms, and returns SEVERAL ranked candidates with their nutrition so
# the user can choose, instead of the app silently guessing.
import re as _re

_STOP = {
    "a", "an", "the", "of", "with", "and", "some", "my", "one", "two", "three", "four", "five", "half",
    "cup", "cups", "glass", "glasses", "bowl", "bowls", "plate", "plates", "piece", "pieces", "slice", "slices",
    "small", "big", "large", "medium", "serving", "servings", "gram", "grams", "g", "ml", "had", "ate", "i",
}
# Words in each group mean the same dish/ingredient (Indian spelling variants, Hindi/English).
_GROUPS = [
    {"tea", "chai"}, {"idli", "idly"}, {"vada", "vade", "vadai", "wada"}, {"sambar", "sambhar"},
    {"curd", "dahi", "yogurt", "yoghurt"}, {"chapati", "roti", "phulka", "chapatti"}, {"egg", "anda", "ande"},
    {"omelette", "omelet", "omlet"}, {"aloo", "potato"}, {"gobi", "gobhi", "cauliflower"},
    {"paratha", "parantha", "paranthas"}, {"biryani", "biriyani", "briyani"}, {"pulao", "pulav", "pilaf", "pilau"},
    {"dosa", "dosai"}, {"pakora", "pakoda", "bhajji", "bhajiya"}, {"kebab", "kabab", "kebap"},
    {"rice", "chawal"}, {"shake", "milkshake"}, {"paneer", "panir"}, {"chole", "chana", "chickpea"},
    {"palak", "spinach"}, {"bhindi", "okra"}, {"baingan", "brinjal", "eggplant"}, {"mutton", "lamb", "goat"},
    {"coriander", "dhania"}, {"lassi", "buttermilk"}, {"dal", "daal", "dhal"}, {"poori", "puri"},
    {"jalebi", "jilebi"}, {"upma", "uppuma"}, {"kheer", "payasam", "payasa"}, {"sandwich", "sandwiches"},
]
_CANON: dict = {}
for _g in _GROUPS:
    _root = sorted(_g)[0]
    for _w in _g:
        _CANON[_w] = _root

_index_cache: dict = {"key": None, "rows": []}


def _stem(word: str) -> str:
    w = word.lower()
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss") and not w.endswith("us"):
        w = w[:-1]
    return w


def _canon(word: str) -> str:
    w = _stem(word)
    return _CANON.get(w, _CANON.get(word.lower(), w))


def _words(text: str) -> list:
    return [_stem(w) for w in _re.findall(r"[a-z0-9]+", (text or "").lower())]


def _query_tokens(query: str) -> list:
    toks = [w for w in _words(query) if w not in _STOP and not w.isdigit()]
    return toks


def _name_variants(name: str) -> list:
    """'Chapati/Roti' -> [['chapati'], ['roti']]; 'Hot tea (Garam Chai)' -> [['hot','tea'], ['garam','chai']]"""
    out = []
    primary = name.split("(")[0]
    for part in primary.split("/"):
        w = _words(part)
        if w:
            out.append(w)
    for inner in _re.findall(r"\(([^)]*)\)", name):
        for part in inner.split("/"):
            w = _words(part)
            if w:
                out.append(w)
    return out


def _load_index():
    conn = _get_conn()
    try:
        count = conn.execute("SELECT COUNT(*) FROM food_items").fetchone()[0]
        key = (DB_PATH, count)
        if _index_cache["key"] == key:
            return _index_cache["rows"]
        rows = conn.execute(
            "SELECT food_code, food_name, quality, quality_note, diet_tag, serving_grams, servings_unit, "
            "energy_kcal_100g, protein_g_100g, carb_g_100g, fat_g_100g, fibre_g_100g, "
            "unit_serving_energy_kcal, unit_serving_protein_g, unit_serving_carb_g, unit_serving_fat_g FROM food_items"
        ).fetchall()
    finally:
        conn.close()
    parsed = []
    for r in rows:
        d = dict(r)
        d["_words"] = set(_words(d["food_name"]))
        d["_primary"] = [w for w in _words(d["food_name"].split("(")[0])]
        d["_variants"] = [{_canon(w) for w in v} for v in _name_variants(d["food_name"])]
        d["_variants"].append({_canon(w) for w in _words(d["food_name"])})  # the whole name, as the coach quotes it back
        parsed.append(d)
    _index_cache.update(key=key, rows=parsed)
    return parsed


def _token_match(q: str, name_words: set) -> float:
    cq = _canon(q)
    if q in name_words or cq in {_canon(w) for w in name_words}:
        return 1.0
    if len(q) >= 4:
        if any(w.startswith(q) for w in name_words):
            return 0.8
        # typo tolerance: same first letter and very similar ("panner" ~ "paneer"), so "makhani" no longer matches "yakhani"
        if any(len(w) >= 4 and w[0] == q[0] and difflib.SequenceMatcher(None, q, w).ratio() >= 0.8 for w in name_words):
            return 0.7
    return 0.0


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _nutri(kcal, p, c, f):
    if kcal is None:
        return None
    return {"calories": round(kcal, 1), "protein_g": round(p or 0, 1), "carbs_g": round(c or 0, 1), "fat_g": round(f or 0, 1)}


def food_row_to_option(d: dict) -> dict:
    """Shape one food_items row as an option card: both per-serving and per-100g nutrition."""
    has_serving = d.get("quality") == "ok" and bool(d.get("servings_unit")) and (_num(d.get("unit_serving_energy_kcal")) or 0) > 0
    per100 = _nutri(_num(d.get("energy_kcal_100g")) if (_num(d.get("energy_kcal_100g")) or 0) > 0 else None,
                    _num(d.get("protein_g_100g")), _num(d.get("carb_g_100g")), _num(d.get("fat_g_100g")))
    per_serv = _nutri(_num(d.get("unit_serving_energy_kcal")), _num(d.get("unit_serving_protein_g")),
                      _num(d.get("unit_serving_carb_g")), _num(d.get("unit_serving_fat_g"))) if has_serving else None
    return {
        "food_code": d["food_code"], "food_name": d["food_name"].strip(), "source": "dataset",
        "quality": d.get("quality"), "quality_note": d.get("quality_note"), "diet_tag": d.get("diet_tag"),
        "serving_label": d.get("servings_unit") if has_serving else None,
        "serving_grams": d.get("serving_grams") if has_serving else None,
        "per_serving": per_serv, "per_100g": per100,
    }


def find_candidates(query: str, diet: str = "any", limit: int = 8, include_custom: bool = True) -> list:
    """Ranked foods related to a query: whole-word match with Indian synonyms and typo tolerance.

    Each result has per-serving and per-100g nutrition plus a `match` block saying which words matched
    and an `exact` flag. Foods outside the user's diet are left out (see `count_hidden_by_diet`).
    """
    toks = _query_tokens(query)
    if not toks:
        return []
    allowed = food_quality.allowed_diet_tags(diet)
    weights = [1.5 if i == len(toks) - 1 else 1.0 for i in range(len(toks))]
    total_w = sum(weights)
    qcanon = {_canon(t) for t in toks}

    conn = _get_conn()
    try:
        familiar = {r["food_code"]: r["times_logged"] for r in conn.execute("SELECT food_code, times_logged FROM food_preferences").fetchall()}
    except Exception:
        familiar = {}
    finally:
        conn.close()

    scored = []
    for d in _load_index():
        if (d.get("diet_tag") or "vegetarian") not in allowed:
            continue
        hits = [_token_match(t, d["_words"]) for t in toks]
        matched = [(t, h) for t, h in zip(toks, hits) if h >= 0.7]
        if not matched:
            continue
        coverage = sum(w * h for w, h in zip(weights, hits)) / total_w
        if coverage < 0.34:
            continue
        exact = any(v == qcanon for v in d["_variants"])
        primary_n = max(len(d["_primary"]), 1)
        extra = max(0, primary_n - len(matched)) / primary_n
        score = coverage * 100 - extra * 12 - primary_n * 0.6
        if exact:
            score += 60
        score += {"ok": 0, "grams_only": -3, "unreliable": -18}.get(d.get("quality"), -3)
        times = familiar.get(d["food_code"], 0)
        score += min(times, 5) * 2
        opt = food_row_to_option(d)
        if opt["per_100g"] is None and opt["per_serving"] is None:
            continue
        opt["exact"] = exact
        opt["logged_before"] = times > 0
        opt["match"] = {"score": round(score, 1), "matched": [t for t, _ in matched], "missing": [t for t, h in zip(toks, hits) if h < 0.7]}
        scored.append((score, opt))

    # everyday staples the dataset lacks (banana, milk, raw rice, oil ...), labelled "reference" in the UI
    try:
        try:
            from backend import ingredient_reference
        except ImportError:
            import ingredient_reference
        for sc, opt in ingredient_reference.search(query, allowed, strict=True):
            opt["logged_before"] = familiar.get(opt["food_code"], 0) > 0
            if opt["logged_before"]:
                sc += 6
            scored.append((sc, opt))
    except Exception:
        pass

    if include_custom:
        try:
            try:
                from backend import custom_foods
            except ImportError:
                import custom_foods
            for opt in custom_foods.search(query):
                opt["logged_before"] = familiar.get(opt["food_code"], 0) > 0
                scored.append((opt["match"]["score"], opt))
        except Exception:
            pass

    scored.sort(key=lambda x: -x[0])
    return [o for _, o in scored[:max(1, limit)]]


def count_hidden_by_diet(query: str, diet: str) -> int:
    """How many related foods exist but are hidden by the user's diet (so the UI can say so)."""
    if (diet or "any") == "any":
        return 0
    try:
        return max(0, len(find_candidates(query, diet="any", limit=40, include_custom=False)) - len(find_candidates(query, diet=diet, limit=40, include_custom=False)))
    except Exception:
        return 0
