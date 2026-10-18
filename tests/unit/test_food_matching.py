"""Unit tests for Food Matching and Retrieval (backend/rag_resolver.py, backend/ingredient_reference.py).

Tests query normalization (casing, stemming, Indian synonyms, stopwords),
exact/near/no-match resolution, diet filtering, household-measure to grams
conversions (katori, roti, tablespoon, cup, piece), and golden tests against the real dataset.
"""
import pytest

from backend import ingredient_reference as ref
from backend import rag_resolver as rr
from backend.math_engine import calculate_meal_macros


# ---------------------------------------------------------------------------
# Name Normalization & Token Processing
# ---------------------------------------------------------------------------

def test_words_tokenization():
    text = "Hot Tea (Garam Chai) & 2 Cups of Milk!"
    words = rr._words(text)
    assert "hot" in words
    assert "tea" in words
    assert "garam" in words
    assert "chai" in words
    assert "milk" in words
    assert "&" not in words
    assert "!" not in words


@pytest.mark.parametrize(
    "word, expected_stem",
    [
        ("bananas", "banana"),
        ("cups", "cup"),
        ("rotis", "roti"),
        ("spoons", "spoon"),
        ("glass", "glass"),      # ends in -ss -> keep
        ("status", "status"),    # ends in -us -> keep
        ("egg", "egg"),
    ],
)
def test_stemming(word, expected_stem):
    assert rr._stem(word) == expected_stem


@pytest.mark.parametrize(
    "word1, word2",
    [
        ("idly", "idli"),
        ("vade", "vada"),
        ("vadai", "vada"),
        ("sambhar", "sambar"),
        ("dahi", "curd"),
        ("yogurt", "curd"),
        ("roti", "chapati"),
        ("phulka", "chapati"),
        ("anda", "egg"),
        ("ande", "egg"),
        ("biriyani", "biryani"),
        ("pulav", "pulao"),
        ("panir", "paneer"),
        ("dhania", "coriander"),
        ("palak", "spinach"),
    ],
)
def test_synonym_canonization(word1, word2):
    """Synonyms within the same group must resolve to the identical canonical root."""
    assert rr._canon(word1) == rr._canon(word2)


def test_query_tokens_filters_stopwords_and_numbers():
    query = "had 2 cups of hot chai with some sugar"
    tokens = rr._query_tokens(query)
    # Stop words: "had", "cups", "of", "with", "some", numbers: "2"
    assert "2" not in tokens
    assert "had" not in tokens
    assert "cup" not in tokens
    assert "of" not in tokens
    assert "some" not in tokens
    assert "hot" in tokens
    assert "chai" in tokens
    assert "sugar" in tokens


def test_name_variants_parsing():
    # Primary slashes (e.g. Chapati/Roti)
    v1 = rr._name_variants("Chapati/Roti")
    assert ["chapati"] in v1
    assert ["roti"] in v1

    # Parenthesized regional aliases (e.g. Hot tea (Garam Chai))
    v2 = rr._name_variants("Hot tea (Garam Chai)")
    assert ["hot", "tea"] in v2
    assert ["garam", "chai"] in v2


# ---------------------------------------------------------------------------
# Lexical & Typo Matching Logic
# ---------------------------------------------------------------------------

def test_token_match_exact_and_synonym():
    name_words = {"curd", "rice"}
    assert rr._token_match("dahi", name_words) == 1.0
    assert rr._token_match("curd", name_words) == 1.0


def test_token_match_prefix():
    name_words = {"paneer", "masala"}
    assert rr._token_match("pane", name_words) == 0.8


def test_token_match_typo_tolerance():
    # "panner" typo for "paneer" (>=4 chars, same first letter, ratio >= 0.8)
    assert rr._token_match("panner", {"paneer"}) == 0.7
    # "makhani" vs "yakhani" (different first letter -> 0.0)
    assert rr._token_match("makhani", {"yakhani"}) == 0.0


# ---------------------------------------------------------------------------
# Food Resolution with Mock DB: Exact, Near, No Match, Diet Mismatch
# ---------------------------------------------------------------------------

def test_resolve_food_exact_match(mock_db):
    res = rr.resolve_food("Idli")
    assert res["status"] == "matched"
    assert res["matched_food_code"] == "ASC144"
    assert res["matched_food_name"] == "Idli"
    assert res["confidence"] == 1.0


def test_resolve_food_substring_match(mock_db):
    """When query is a substring of food_name (not an exact match)."""
    # In mock_db, 'Paneer pulao' exists. Querying 'pulao' triggers substring match.
    res = rr.resolve_food("pulao")
    assert res["status"] == "matched"
    assert res["match_method"] == "substring"
    assert "pulao" in res["matched_food_name"].lower()


def test_resolve_food_fuzzy_match(mock_db):
    """When neither exact nor substring matches, fuzzy difflib fallback executes."""
    # Insert food with distinct name
    conn = rr._get_conn()
    conn.execute("""
        INSERT INTO food_items (food_code, food_name, quality, diet_tag, energy_kcal_100g)
        VALUES ('FUZZ01', 'Cardamom powder', 'ok', 'vegan', 311.0)
    """)
    conn.commit()
    conn.close()

    # Query with a close typo that does not contain 'Cardamom' as a substring
    res = rr.resolve_food("Cardamom powdr")
    assert res["status"] == "matched"
    assert res["match_method"] == "fuzzy"
    assert res["matched_food_code"] == "FUZZ01"


def test_resolve_food_alias_match(mock_db):
    # ALIASES maps "idly" -> "idli"
    res = rr.resolve_food("idly")
    assert res["status"] == "matched"
    assert res["matched_food_code"] == "ASC144"


def test_resolve_food_no_match(mock_db):
    res = rr.resolve_food("NonExistentUnobtainableFood98765")
    assert res["status"] == "not_found"
    assert res["query"] == "NonExistentUnobtainableFood98765"


def test_resolve_food_diet_mismatch(mock_db):
    """When a dish exists but is prohibited by the user's diet."""
    conn = rr._get_conn()
    conn.execute("""
        INSERT INTO food_items (food_code, food_name, quality, diet_tag, energy_kcal_100g)
        VALUES ('NV001', 'Chicken Tikka', 'ok', 'non_veg', 180.0)
    """)
    conn.commit()
    conn.close()

    res = rr.resolve_food("Chicken Tikka", diet="vegetarian")
    assert res["status"] == "diet_mismatch"
    assert res["diet"] == "vegetarian"


def test_search_foods_substring(mock_db):
    results = rr.search_foods("idli", diet="any", limit=5)
    assert len(results) >= 1
    assert any(r["food_code"] == "ASC144" for r in results)


def test_warm_index(mock_db):
    # Ensure warm_index executes cleanly
    rr.warm_index()
    assert len(rr._index_cache["rows"]) >= 1


# ---------------------------------------------------------------------------
# Household-Measure to Grams Conversions (ingredient_reference.py)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "unit, quantity, expected_grams",
    [
        ("g", 150.0, 150.0),
        ("gm", 200.0, 200.0),
        ("grams", 75.0, 75.0),
        ("kg", 1.5, 1500.0),
        ("kilo", 2.0, 2000.0),
        ("oz", 2.0, 56.7),
        ("lb", 1.0, 453.6),
    ],
)
def test_grams_for_mass_units(unit, quantity, expected_grams):
    g, est, _ = ref.grams_for(None, quantity, unit)
    assert not est
    assert g == expected_grams


def test_grams_for_katori_volume():
    """katori = 150 ml. If entry is curd (density 1.03), 1 katori = 154.5g; if default, 150.0g."""
    curd_entry = ref.get("curd")
    g_curd, est, how = ref.grams_for(curd_entry, 1.0, "katori")
    assert est
    assert g_curd == 154.5
    assert "150 ml" in how

    g_plain, est, _ = ref.grams_for(None, 1.0, "katori")
    assert est
    assert g_plain == 150.0  # default density 1.0


def test_grams_for_tablespoon_and_cup():
    """tbsp = 15 ml, cup = 240 ml."""
    # Cooking oil (density 0.92): 1 tbsp = 15 * 0.92 = 13.8g
    oil_entry = ref.get("oil")
    g_oil, est, _ = ref.grams_for(oil_entry, 1.0, "tbsp")
    assert est
    assert g_oil == 13.8

    # Milk (density 1.03): 1 cup = 240 * 1.03 = 247.2g
    milk_entry = ref.get("milk")
    g_milk, est, _ = ref.grams_for(milk_entry, 1.0, "cup")
    assert est
    assert g_milk == 247.2


def test_grams_for_pieces():
    """piece/pcs uses piece_g from reference item."""
    # Whole egg has piece_g = 50g
    egg_entry = ref.get("egg")
    g_egg, est, how = ref.grams_for(egg_entry, 2.0, "pcs")
    assert est
    assert g_egg == 100.0
    assert "50 g each" in how

    # Medium onion has piece_g = 110g
    onion_entry = ref.get("onion")
    g_onion, est, _ = ref.grams_for(onion_entry, 1.0, "piece")
    assert est
    assert g_onion == 110.0

    # Fixed count units: pinch = 0.4g, handful = 30.0g
    g_pinch, est, _ = ref.grams_for(None, 2.0, "pinch")
    assert est
    assert g_pinch == 0.8

    g_handful, est, _ = ref.grams_for(None, 1.0, "handful")
    assert est
    assert g_handful == 30.0


def test_grams_for_unknown_unit():
    g, est, how = ref.grams_for(None, 5.0, "lightyears")
    assert g is None
    assert est
    assert "unknown unit 'lightyears'" in how


# ---------------------------------------------------------------------------
# Golden Test Against Real Dataset (Idli ASC144 & Roti ASC096)
# ---------------------------------------------------------------------------

def test_golden_dataset_idli_lookup_and_macros(real_db):
    """Golden test verifying real dataset lookup for Idli:
    - Resolves 'idli' to food code ASC144
    - Standard serving is 25 g
    - Exactly ~34.5 kcal per idli (verified from backend/data/anuvaad.xlsx)
    """
    res = rr.resolve_food("idli")
    assert res["status"] == "matched"
    assert res["matched_food_code"] == "ASC144"
    assert res["matched_food_name"] == "Idli"
    assert res["serving_grams"] == 25.0
    assert res["servings_unit"] == "idli"
    assert res["quality"] == "ok"

    # Calculate exact macros via math engine
    macros = calculate_meal_macros("ASC144", 1.0, unit="serving")
    assert "error" not in macros
    assert macros["food_code"] == "ASC144"
    assert macros["food_name"] == "Idli"
    assert macros["serving_label"] == "idli"
    # unit_serving_energy_kcal in source data is 34.469776 -> rounded to 34.5
    assert macros["calories"] == pytest.approx(34.5, abs=0.1)
    assert macros["protein_g"] == pytest.approx(1.2, abs=0.1)
    assert macros["carbs_g"] == pytest.approx(7.1, abs=0.1)
    assert macros["fat_g"] == pytest.approx(0.1, abs=0.1)


def test_golden_dataset_roti_lookup_and_macros(real_db):
    """Golden test verifying real dataset lookup for Roti:
    - Resolves 'roti' via alias to 'chapati/roti' (ASC096)
    - Standard serving weight is 36 g per roti
    - Stated calorie is ~72.8 kcal per roti
    """
    res = rr.resolve_food("roti")
    assert res["status"] == "matched"
    assert res["matched_food_code"] == "ASC096"
    assert "Chapati/Roti" in res["matched_food_name"]
    assert res["serving_grams"] == 36.0
    assert res["servings_unit"] == "chapati"
    assert res["quality"] == "ok"

    macros = calculate_meal_macros("ASC096", 2.0, unit="serving")
    assert "error" not in macros
    assert macros["calories"] == pytest.approx(145.7, abs=0.2)  # 72.8 * 2


# ---------------------------------------------------------------------------
# Candidate Search & Diet Filter Counts
# ---------------------------------------------------------------------------

def test_find_candidates_ranking(real_db):
    cands = rr.find_candidates("idli", limit=5)
    assert len(cands) >= 1
    top = cands[0]
    assert top["food_code"] == "ASC144"
    assert top["food_name"] == "Idli"
    assert top["exact"] is True
    assert top["per_serving"]["calories"] == pytest.approx(34.5, abs=0.1)


def test_ingredient_reference_helpers():
    # option_for with serving
    curd = ref.get("curd")
    opt = ref.option_for(curd)
    assert opt["serving_label"] == "katori (100 g)"
    assert opt["per_serving"]["calories"] == 60.0

    # search with allowed tags
    results = ref.search("paneer", {"vegetarian", "vegan"})
    assert len(results) >= 1
    assert any(o["food_code"] == "ref:paneer" for _, o in results)

    # search empty query returns []
    assert ref.search("", {"vegan"}) == []

    # best_for_ingredient
    best = ref.best_for_ingredient("toor dal")
    assert best is not None
    assert best["food_code"] == "ref:toor_dal"

    # grams_for with bread slice
    bread = ref.get("bread_white")
    g_slice, est, _ = ref.grams_for(bread, 2.0, "slices")
    assert est
    assert g_slice == 56.0  # 2 * 28g


def test_count_hidden_by_diet(real_db):
    # Chicken dishes are hidden when diet is vegetarian
    hidden = rr.count_hidden_by_diet("chicken", diet="vegetarian")
    assert hidden > 0
    # For diet="any", hidden is 0
    assert rr.count_hidden_by_diet("chicken", diet="any") == 0


def test_find_candidates_empty_and_logged_before(real_db):
    assert rr.find_candidates("") == []

    # Insert preference to test logged_before boost
    conn = rr._get_conn()
    conn.execute("INSERT OR REPLACE INTO food_preferences (food_code, times_logged) VALUES ('ASC144', 3)")
    conn.commit()
    conn.close()

    cands = rr.find_candidates("idli", limit=3)
    assert len(cands) >= 1
    assert cands[0]["food_code"] == "ASC144"
    assert cands[0]["logged_before"] is True
