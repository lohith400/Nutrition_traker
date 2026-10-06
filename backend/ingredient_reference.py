"""Reference values for everyday ingredients the Anuvaad dataset does not contain.

The dataset (1,014 prepared Indian dishes) has no raw staples: no oil, ghee, sugar, milk,
uncooked rice or dal, raw vegetables, or fruit like a plain banana. People still eat and cook
with these every day, and the custom-food builder needs them. This table holds typical values
per 100 g (rounded from IFCT / USDA reference tables). They are *typical* values, so every
result that uses one is labelled "reference" in the UI, separate from the dataset's own rows.

Pure data + small helpers. No database access and no model involved.

A reference food is addressed as  food_code = "ref:<key>"  everywhere else in the app.
"""
from __future__ import annotations

# key, display name, diet tag, kcal, protein, carbs, fat, fibre per 100 g, keywords,
# serving (label, grams) or None, density g/ml for volume units or None, grams per piece or None, note
_ROWS = [
    # --- cereals, flours, bread ---
    ("rice_cooked", "Rice, cooked (plain)", "vegan", 130, 2.7, 28.2, 0.3, 0.4,
     ["rice", "plain rice", "cooked rice", "steamed rice", "white rice", "boiled rice"], ("cup, cooked", 160), None, None,
     "Cooked weight. For uncooked rice say 'raw rice'."),
    ("rice_raw", "Rice, raw (white / basmati)", "vegan", 345, 6.8, 78.2, 0.5, 0.2,
     ["raw rice", "uncooked rice", "rice raw", "basmati", "basmati rice", "raw basmati rice", "white rice raw"], None, 0.8, None, "Uncooked weight."),
    ("brown_rice_cooked", "Brown rice, cooked", "vegan", 123, 2.7, 25.6, 1.0, 1.8,
     ["brown rice", "cooked brown rice"], ("cup, cooked", 195), None, None, None),
    ("atta", "Wheat flour (atta)", "vegan", 340, 12.1, 69.4, 1.7, 11.4,
     ["atta", "wheat flour", "whole wheat flour", "chapati flour", "gehu ka atta"], None, 0.5, None, None),
    ("maida", "Refined flour (maida)", "vegan", 348, 11.0, 73.9, 0.9, 2.7, ["maida", "refined flour", "all purpose flour", "plain flour"], None, 0.53, None, None),
    ("besan", "Gram flour (besan)", "vegan", 387, 22.4, 57.8, 6.7, 10.8, ["besan", "gram flour", "chickpea flour"], None, 0.4, None, None),
    ("rava", "Semolina (rava / sooji)", "vegan", 348, 10.4, 74.0, 0.8, 3.9, ["rava", "sooji", "suji", "semolina"], None, 0.67, None, None),
    ("oats", "Oats (dry, rolled)", "vegan", 389, 16.9, 66.3, 6.9, 10.6, ["oats", "rolled oats", "oatmeal", "dry oats"], ("40 g serving", 40), 0.38, None, "Dry weight."),
    ("poha_raw", "Poha (flattened rice, dry)", "vegan", 346, 6.6, 77.3, 1.2, 2.0, ["raw poha", "dry poha", "flattened rice", "aval"], None, 0.35, None, "Dry weight."),
    ("bread_white", "Bread, white", "vegan", 265, 9.0, 49.0, 3.2, 2.7, ["bread", "white bread", "bread slice", "slice bread"], ("slice", 28), None, 28, None),
    ("bread_brown", "Bread, brown / whole wheat", "vegan", 247, 13.0, 41.0, 3.4, 7.0,
     ["brown bread", "whole wheat bread", "wheat bread", "multigrain bread", "whole grain bread"], ("slice", 30), None, 30, None),
    # --- pulses (dry) ---
    ("toor_dal", "Toor dal (raw)", "vegan", 335, 22.3, 57.6, 1.7, 15.0, ["toor dal", "arhar dal", "tur dal", "toor", "arhar", "pigeon pea"], None, 0.83, None, "Dry weight."),
    ("moong_dal", "Moong dal (raw)", "vegan", 348, 24.0, 59.9, 1.2, 16.3, ["moong dal", "moong", "mung dal", "green gram", "yellow moong dal"], None, 0.83, None, "Dry weight."),
    ("masoor_dal", "Masoor dal (raw)", "vegan", 343, 25.1, 59.0, 0.7, 10.8, ["masoor dal", "masoor", "red lentil", "red lentils"], None, 0.83, None, "Dry weight."),
    ("chana_dal", "Chana dal (raw)", "vegan", 372, 20.8, 59.8, 5.6, 12.0, ["chana dal", "bengal gram dal", "split chickpea"], None, 0.83, None, "Dry weight."),
    ("urad_dal", "Urad dal (raw)", "vegan", 347, 24.0, 59.0, 1.4, 18.0, ["urad dal", "urad", "black gram dal"], None, 0.83, None, "Dry weight."),
    ("rajma", "Rajma (raw)", "vegan", 333, 22.9, 60.0, 1.3, 24.9, ["rajma", "kidney beans", "red kidney beans"], None, 0.8, None, "Dry weight."),
    ("chickpeas", "Chickpeas / kabuli chana (raw)", "vegan", 364, 19.3, 60.6, 6.0, 17.4, ["chickpeas", "kabuli chana", "chole", "chana", "garbanzo"], None, 0.8, None, "Dry weight."),
    ("soya_chunks", "Soya chunks (dry)", "vegan", 345, 52.0, 33.0, 0.5, 13.0, ["soya chunks", "soy chunks", "meal maker", "nutrela", "soya"], None, 0.4, None, "Dry weight."),
    ("sprouts", "Moong sprouts", "vegan", 30, 3.0, 5.9, 0.2, 1.8, ["sprouts", "moong sprouts", "sprouted moong"], None, 0.5, None, None),
    # --- dairy ---
    ("milk", "Milk, whole (cow)", "vegetarian", 67, 3.2, 4.4, 4.1, 0.0, ["milk", "cow milk", "whole milk", "full cream milk", "full fat milk"], ("glass (200 ml)", 206), 1.03, None, None),
    ("milk_toned", "Milk, toned", "vegetarian", 58, 3.0, 4.7, 3.0, 0.0, ["toned milk", "double toned milk"], ("glass (200 ml)", 206), 1.03, None, None),
    ("curd", "Curd / dahi (plain)", "vegetarian", 60, 3.1, 3.0, 4.0, 0.0, ["curd", "dahi", "yogurt", "yoghurt", "plain curd", "plain yogurt"], ("katori (100 g)", 100), 1.03, None, None),
    ("paneer", "Paneer", "vegetarian", 265, 18.3, 1.2, 20.8, 0.0, ["paneer", "cottage cheese", "raw paneer"], None, None, None, None),
    ("cheese", "Cheese (processed)", "vegetarian", 350, 22.0, 2.0, 28.0, 0.0, ["cheese", "processed cheese", "cheese slice", "cheddar"], ("slice (20 g)", 20), None, 20, "Typical value; brands vary."),
    ("ghee", "Ghee", "vegetarian", 900, 0.0, 0.0, 100.0, 0.0, ["ghee", "clarified butter", "desi ghee"], ("tsp (5 g)", 4.5), 0.91, None, None),
    ("butter", "Butter", "vegetarian", 717, 0.9, 0.1, 81.1, 0.0, ["butter", "salted butter", "unsalted butter", "makhan"], ("tbsp (14 g)", 14), 0.96, None, None),
    # --- oils, sugars ---
    ("oil", "Cooking oil", "vegan", 900, 0.0, 0.0, 100.0, 0.0,
     ["oil", "cooking oil", "vegetable oil", "sunflower oil", "groundnut oil", "mustard oil", "coconut oil", "olive oil", "refined oil", "sesame oil"],
     ("tsp (5 ml)", 4.6), 0.92, None, "All common cooking oils are about 100% fat."),
    ("sugar", "Sugar", "vegan", 387, 0.0, 99.8, 0.0, 0.0, ["sugar", "white sugar", "cheeni", "castor sugar"], ("tsp (4 g)", 4.2), 0.85, None, None),
    ("jaggery", "Jaggery (gud)", "vegan", 383, 0.4, 95.0, 0.1, 0.0, ["jaggery", "gud", "gur"], None, 1.0, None, None),
    ("honey", "Honey", "vegetarian", 304, 0.3, 82.4, 0.0, 0.2, ["honey", "shahad"], ("tsp (7 g)", 7), 1.42, None, None),
    # --- eggs, meat, fish ---
    ("egg", "Egg, whole (raw)", "eggetarian", 143, 12.6, 0.7, 9.5, 0.0, ["egg", "eggs", "whole egg", "raw egg", "anda"], ("egg (50 g)", 50), None, 50, None),
    ("egg_white", "Egg white", "eggetarian", 52, 10.9, 0.7, 0.2, 0.0, ["egg white", "egg whites"], ("egg white (33 g)", 33), None, 33, None),
    ("chicken", "Chicken breast (raw, boneless)", "non_veg", 120, 22.5, 0.0, 2.6, 0.0, ["chicken", "chicken breast", "boneless chicken", "raw chicken", "chicken raw"], None, None, None, "Raw weight."),
    ("mutton", "Mutton / goat meat (raw)", "non_veg", 118, 21.4, 0.0, 3.6, 0.0, ["mutton", "goat meat", "lamb", "raw mutton"], None, None, None, "Raw weight."),
    ("fish", "Fish, rohu (raw)", "non_veg", 97, 16.6, 0.0, 1.4, 0.0, ["fish", "rohu", "fish fillet", "raw fish"], None, None, None, "Raw weight."),
    ("prawns", "Prawns (raw)", "non_veg", 85, 20.1, 0.0, 0.5, 0.0, ["prawns", "prawn", "shrimp", "shrimps"], None, None, None, "Raw weight."),
    # --- vegetables ---
    ("onion", "Onion", "vegan", 45, 1.2, 10.6, 0.1, 1.0, ["onion", "onions", "pyaaz", "pyaz"], ("medium onion", 110), None, 110, None),
    ("tomato", "Tomato", "vegan", 20, 0.9, 3.6, 0.2, 1.2, ["tomato", "tomatoes", "tamatar"], ("medium tomato", 100), None, 100, None),
    ("potato", "Potato", "vegan", 77, 2.0, 17.5, 0.1, 2.2, ["potato", "potatoes", "aloo"], ("medium potato", 150), None, 150, None),
    ("sweet_potato", "Sweet potato", "vegan", 86, 1.6, 20.1, 0.1, 3.0, ["sweet potato", "shakarkandi"], ("medium", 130), None, 130, None),
    ("carrot", "Carrot", "vegan", 41, 0.9, 9.6, 0.2, 2.8, ["carrot", "carrots", "gajar"], ("medium carrot", 70), None, 70, None),
    ("spinach", "Spinach (palak)", "vegan", 23, 2.9, 3.6, 0.4, 2.2, ["spinach", "palak"], None, 0.25, None, None),
    ("cabbage", "Cabbage", "vegan", 25, 1.3, 5.8, 0.1, 2.5, ["cabbage", "patta gobi", "band gobi"], None, 0.4, None, None),
    ("cauliflower", "Cauliflower", "vegan", 25, 1.9, 5.0, 0.3, 2.0, ["cauliflower", "gobi", "gobhi", "phool gobi"], None, 0.4, None, None),
    ("peas", "Green peas", "vegan", 81, 5.4, 14.5, 0.4, 5.1, ["peas", "green peas", "matar"], None, 0.65, None, None),
    ("capsicum", "Capsicum (bell pepper)", "vegan", 24, 1.0, 5.0, 0.2, 2.0, ["capsicum", "bell pepper", "shimla mirch"], ("medium", 120), None, 120, None),
    ("brinjal", "Brinjal (eggplant)", "vegan", 25, 1.0, 5.9, 0.2, 3.0, ["brinjal", "eggplant", "baingan", "aubergine"], ("medium", 150), None, 150, None),
    ("cucumber", "Cucumber", "vegan", 15, 0.7, 3.6, 0.1, 0.5, ["cucumber", "kheera", "kakdi"], ("medium", 200), None, 200, None),
    ("bhindi", "Okra (bhindi)", "vegan", 33, 1.9, 7.5, 0.2, 3.2, ["okra", "bhindi", "ladies finger"], None, 0.4, None, None),
    ("bottle_gourd", "Bottle gourd (lauki)", "vegan", 14, 0.6, 3.4, 0.1, 0.5, ["bottle gourd", "lauki", "dudhi", "doodhi"], None, 0.5, None, None),
    ("beetroot", "Beetroot", "vegan", 43, 1.6, 9.6, 0.2, 2.8, ["beetroot", "beet", "chukandar"], ("medium", 80), None, 80, None),
    ("mushroom", "Mushroom", "vegan", 22, 3.1, 3.3, 0.3, 1.0, ["mushroom", "mushrooms"], None, 0.3, None, None),
    ("garlic", "Garlic", "vegan", 149, 6.4, 33.1, 0.5, 2.1, ["garlic", "lehsun"], ("clove (3 g)", 3), None, 3, None),
    ("ginger", "Ginger", "vegan", 80, 1.8, 17.8, 0.8, 2.0, ["ginger", "adrak"], None, 0.9, None, None),
    ("green_chilli", "Green chilli", "vegan", 40, 2.0, 9.5, 0.2, 1.5, ["green chilli", "green chillies", "hari mirch", "chilli"], ("1 chilli (5 g)", 5), None, 5, None),
    ("coriander_leaves", "Coriander leaves", "vegan", 23, 2.1, 3.7, 0.5, 2.8, ["coriander leaves", "cilantro", "dhania patta", "hara dhania"], None, 0.2, None, None),
    # --- fruit ---
    ("banana", "Banana", "vegan", 89, 1.1, 22.8, 0.3, 2.6, ["banana", "kela", "bananas"], ("medium banana", 118), None, 118, None),
    ("apple", "Apple", "vegan", 52, 0.3, 13.8, 0.2, 2.4, ["apple", "apples", "seb"], ("medium apple", 182), None, 182, None),
    ("orange", "Orange", "vegan", 47, 0.9, 11.8, 0.1, 2.4, ["orange", "oranges", "santra", "mosambi"], ("medium orange", 130), None, 130, None),
    ("mango", "Mango (pulp)", "vegan", 60, 0.8, 15.0, 0.4, 1.6, ["mango", "aam"], ("medium mango (pulp)", 200), None, 200, None),
    ("grapes", "Grapes", "vegan", 69, 0.7, 18.1, 0.2, 0.9, ["grapes", "angoor"], None, 0.6, None, None),
    ("papaya", "Papaya", "vegan", 43, 0.5, 10.8, 0.3, 1.7, ["papaya", "papita"], None, 0.65, None, None),
    ("watermelon", "Watermelon", "vegan", 30, 0.6, 7.6, 0.2, 0.4, ["watermelon", "tarbooz"], None, 0.6, None, None),
    ("pomegranate", "Pomegranate", "vegan", 83, 1.7, 18.7, 1.2, 4.0, ["pomegranate", "anar"], None, 0.6, None, None),
    ("guava", "Guava", "vegan", 68, 2.6, 14.3, 1.0, 5.4, ["guava", "amrud"], ("medium", 100), None, 100, None),
    ("pineapple", "Pineapple", "vegan", 50, 0.5, 13.1, 0.1, 1.4, ["pineapple", "ananas"], None, 0.6, None, None),
    ("dates", "Dates (dry)", "vegan", 282, 2.5, 75.0, 0.4, 8.0, ["dates", "khajoor", "date"], ("date (8 g)", 8), None, 8, None),
    ("coconut", "Coconut, fresh", "vegan", 354, 3.3, 15.2, 33.5, 9.0, ["coconut", "fresh coconut", "grated coconut", "nariyal"], None, 0.33, None, None),
    ("coconut_milk", "Coconut milk", "vegan", 230, 2.3, 5.5, 23.8, 2.2, ["coconut milk", "nariyal ka doodh"], None, 1.0, None, None),
    # --- nuts, seeds ---
    ("peanuts", "Peanuts", "vegan", 567, 25.8, 16.1, 49.2, 8.5, ["peanuts", "peanut", "groundnut", "groundnuts", "moongfali"], ("handful (30 g)", 30), 0.6, 0.6, None),
    ("almonds", "Almonds", "vegan", 579, 21.2, 21.6, 49.9, 12.5, ["almonds", "almond", "badam"], ("handful (28 g)", 28), 0.6, 1.2, None),
    ("cashews", "Cashew nuts", "vegan", 553, 18.2, 30.2, 43.9, 3.3, ["cashew", "cashews", "kaju", "cashew nuts"], ("handful (28 g)", 28), 0.55, 1.5, None),
    ("walnuts", "Walnuts", "vegan", 654, 15.2, 13.7, 65.2, 6.7, ["walnuts", "walnut", "akhrot"], ("handful (28 g)", 28), 0.45, 4.0, None),
    ("peanut_butter", "Peanut butter", "vegan", 588, 25.0, 20.0, 50.0, 6.0, ["peanut butter", "pb"], ("tbsp (16 g)", 16), 1.0, None, None),
    ("chia", "Chia seeds", "vegan", 486, 16.5, 42.1, 30.7, 34.4, ["chia", "chia seeds"], ("tbsp (12 g)", 12), 0.8, None, None),
    ("flax", "Flax seeds", "vegan", 534, 18.3, 28.9, 42.2, 27.3, ["flax", "flax seeds", "alsi", "flaxseed", "flaxseeds"], ("tbsp (10 g)", 10), 0.7, None, None),
    # --- other ---
    ("tofu", "Tofu", "vegan", 76, 8.0, 1.9, 4.8, 0.3, ["tofu", "soy paneer"], None, None, None, None),
    ("whey", "Whey protein powder (typical)", "vegetarian", 400, 80.0, 8.0, 6.0, 0.0, ["whey", "whey protein", "protein powder", "protein shake", "protein scoop"], ("scoop (30 g)", 30), 0.45, None, "Typical value. Check your tub's label for the exact numbers."),
    ("tamarind", "Tamarind", "vegan", 239, 2.8, 62.5, 0.6, 5.1, ["tamarind", "imli"], None, 1.0, None, None),
    ("spice", "Spice powder (turmeric, chilli, cumin, coriander, masala)", "vegan", 300, 12.0, 52.0, 12.0, 25.0,
     ["spice", "spices", "masala", "garam masala", "turmeric", "haldi", "chilli powder", "red chilli powder", "coriander powder", "dhania powder", "cumin", "jeera",
      "mustard seeds", "rai", "pepper", "black pepper", "kali mirch", "sambar powder", "hing"], None, 0.5, None, "Used in small amounts, so the contribution is tiny."),
    ("salt", "Salt", "vegan", 0, 0.0, 0.0, 0.0, 0.0, ["salt", "namak"], None, 1.2, None, None),
    ("water", "Water", "vegan", 0, 0.0, 0.0, 0.0, 0.0, ["water", "paani"], None, 1.0, None, None),
]

KEYS = ("key", "name", "diet_tag", "kcal", "protein", "carbs", "fat", "fibre", "keywords", "serving", "density", "piece_g", "note")
REFERENCE: dict = {r[0]: dict(zip(KEYS, r)) for r in _ROWS}

# units -> grams (mass), millilitres (volume) or counts. Volume is turned into grams with the food's density.
MASS_G = {"g": 1.0, "gm": 1.0, "gms": 1.0, "gram": 1.0, "grams": 1.0, "grm": 1.0, "kg": 1000.0, "kgs": 1000.0, "kilo": 1000.0,
          "kilogram": 1000.0, "mg": 0.001, "oz": 28.35, "ounce": 28.35, "lb": 453.6, "lbs": 453.6}
VOLUME_ML = {"ml": 1.0, "millilitre": 1.0, "milliliter": 1.0, "l": 1000.0, "lt": 1000.0, "ltr": 1000.0, "litre": 1000.0, "liter": 1000.0,
             "tsp": 5.0, "teaspoon": 5.0, "tbsp": 15.0, "tablespoon": 15.0, "tbs": 15.0, "cup": 240.0, "cups": 240.0, "glass": 250.0,
             "katori": 150.0, "bowl": 250.0, "mug": 300.0}
COUNT_UNITS = {"pcs", "pc", "piece", "pieces", "nos", "no", "whole", "unit", "units", "count", "clove", "cloves", "slice", "slices",
               "pinch", "handful", "dash", "medium", "large", "small", ""}
# for counts that are not "one piece of the ingredient"
FIXED_COUNT_G = {"pinch": 0.4, "dash": 0.4, "handful": 30.0}


def get(key: str) -> dict | None:
    return REFERENCE.get(key)


def option_for(entry: dict) -> dict:
    """Shape a reference row like a dataset option card (see rag_resolver.food_row_to_option)."""
    k100 = {"calories": entry["kcal"], "protein_g": entry["protein"], "carbs_g": entry["carbs"], "fat_g": entry["fat"]}
    per_serv = serving_label = serving_g = None
    if entry["serving"]:
        serving_label, serving_g = entry["serving"]
        f = serving_g / 100.0
        per_serv = {"calories": round(entry["kcal"] * f, 1), "protein_g": round(entry["protein"] * f, 1),
                    "carbs_g": round(entry["carbs"] * f, 1), "fat_g": round(entry["fat"] * f, 1)}
    return {
        "food_code": f"ref:{entry['key']}", "food_name": entry["name"], "source": "reference", "quality": "ok",
        "quality_note": entry.get("note"), "diet_tag": entry["diet_tag"], "serving_label": serving_label,
        "serving_grams": serving_g, "per_serving": per_serv, "per_100g": k100,
    }


def search(query: str, allowed_tags: set, strict: bool = False) -> list:
    """Reference foods matching a query: [(score, option)]. Uses the same word rules as the dataset search."""
    try:
        from backend import rag_resolver as rr
    except ImportError:  # pragma: no cover
        import rag_resolver as rr
    qtoks = rr._query_tokens(query)
    if not qtoks:
        return []
    qset = {rr._canon(t) for t in qtoks}
    out = []
    for entry in REFERENCE.values():
        if entry["diet_tag"] not in allowed_tags:
            continue
        best, exact = 0.0, False
        for phrase in entry["keywords"]:
            ptoks = {rr._canon(w) for w in rr._words(phrase) if w not in rr._STOP}
            if not ptoks:
                continue
            inter = len(ptoks & qset)
            if not inter:
                continue
            if ptoks == qset:
                best, exact = 120.0, True
                break
            cov = inter / max(len(qset), len(ptoks))
            # strict (food search): a longer query like "masala chai" must not match the one-word entry "masala"
            if strict and not qset <= ptoks:
                continue
            if cov >= 0.5 and (ptoks <= qset or qset <= ptoks):
                best = max(best, 55 + 35 * cov)
        if best:
            opt = option_for(entry)
            opt["exact"] = exact
            opt["match"] = {"score": round(best, 1), "matched": sorted(qset), "missing": []}
            out.append((best, opt))
    return out


def best_for_ingredient(name: str, allowed_tags: set | None = None) -> dict | None:
    """Best reference row for a recipe ingredient name ('basmati rice', 'toor dal', 'sunflower oil')."""
    allowed = allowed_tags or {"vegan", "vegetarian", "eggetarian", "non_veg"}
    hits = sorted(search(name, allowed), key=lambda x: -x[0])
    return hits[0][1] if hits else None


def grams_for(entry: dict | None, quantity: float, unit: str) -> tuple[float | None, bool, str]:
    """Convert '2 tbsp' of an ingredient to grams. Returns (grams or None, estimated?, how)."""
    u = (unit or "").strip().lower().rstrip(".")
    if u in MASS_G:
        return round(quantity * MASS_G[u], 1), False, f"{quantity:g} {u}"
    if u in VOLUME_ML:
        ml = quantity * VOLUME_ML[u]
        density = (entry or {}).get("density")
        if density is None and entry is None:
            density = 1.0
        if density is None:
            density = 0.6
        return round(ml * density, 1), True, f"{quantity:g} {u} ≈ {round(ml)} ml × {density} g/ml"
    if u in COUNT_UNITS:
        if u in FIXED_COUNT_G:
            return round(quantity * FIXED_COUNT_G[u], 1), True, f"{quantity:g} {u}"
        piece = (entry or {}).get("piece_g")
        if u in ("slice", "slices") and entry and entry.get("serving") and "slice" in entry["serving"][0]:
            piece = entry["serving"][1]
        if piece:
            return round(quantity * piece, 1), True, f"{quantity:g} × {piece:g} g each"
        return None, True, "no standard piece weight; enter grams"
    return None, True, f"unknown unit '{unit}'"
