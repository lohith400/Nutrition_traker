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