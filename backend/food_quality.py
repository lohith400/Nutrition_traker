"""Data-quality gate and diet tagging for the Anuvaad food dataset.

The source data has real problems (verified against the shipped xlsx):
  * ~84 dishes have a "per serving" value above 1,200 kcal (e.g. Paneer pulao
    = 4,876 kcal per plate) - these look like whole-recipe totals.
  * ~110 dishes have a per-100g fat value >= 50 g (denser than most foods
    actually are) or macros that don't add up to the stated kcal.
  * ~82 dishes have no serving data at all (so "1 serving" is meaningless).

Rather than silently showing wrong numbers, every food gets a `quality` grade:

  ok          per-100g and per-serving both look plausible -> offer both units
  grams_only  per-100g is plausible but there is no usable serving -> grams only
  unreliable  the numbers themselves look wrong -> warn, never auto-suggest

Pure functions only (no DB access) so they are trivially testable.
"""
import re

MAX_SERVING_KCAL = 700        # one "serving" above this is almost certainly a recipe total
MAX_SERVING_GRAMS = 800       # implied serving weight (serving kcal / kcal-per-100g)
MAX_KCAL_100G = 700           # only pure fats/oils are denser; cooked dishes never are
MAX_FAT_100G = 50
ATWATER_TOLERANCE = 0.35      # |4P+4C+9F - kcal| / kcal


def _num(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def assess(row) -> dict:
    """Grade one food row (sqlite3.Row or dict). Returns quality info to persist."""
    kcal100 = _num(row["energy_kcal_100g"])
    fat100 = _num(row["fat_g_100g"])
    protein100 = _num(row["protein_g_100g"])
    carb100 = _num(row["carb_g_100g"])
    serv_kcal = _num(row["unit_serving_energy_kcal"])
    serv_unit = (row["servings_unit"] or "").strip()

    has_serving = bool(serv_unit) and serv_kcal > 0
    serving_grams = round(serv_kcal / kcal100 * 100) if has_serving and kcal100 > 5 else None

    notes = []
    per100_ok = True
    if kcal100 <= 0:
        per100_ok = False
        notes.append("no energy value in source data")
    if kcal100 > MAX_KCAL_100G or fat100 >= MAX_FAT_100G:
        per100_ok = False
        notes.append("per-100g values look implausibly high")
    atwater = 4 * protein100 + 4 * carb100 + 9 * fat100
    if kcal100 > 0 and abs(atwater - kcal100) > 25 and abs(atwater - kcal100) / kcal100 > ATWATER_TOLERANCE:
        per100_ok = False
        notes.append("macros don't add up to the stated calories")

    serving_ok = has_serving and per100_ok
    if has_serving and per100_ok:
        if serv_kcal > MAX_SERVING_KCAL:
            serving_ok = False
            notes.append("per-serving value looks like a whole-recipe total")
        elif serving_grams and serving_grams > MAX_SERVING_GRAMS:
            serving_ok = False
            notes.append("implied serving weight is unrealistic")

    if not per100_ok:
        quality = "unreliable"
    elif serving_ok:
        quality = "ok"
    else:
        quality = "grams_only"
        if not has_serving and not notes:
            notes.append("no serving size in source data")

    return {
        "quality": quality,
        "quality_note": "; ".join(notes) or None,
        "serving_grams": serving_grams if serving_ok else None,
    }


# --------------------------------------------------------------------------
# Diet tagging (best-effort, name based - the dataset has no diet column)
# --------------------------------------------------------------------------
_NON_VEG = re.compile(
    r"\b(chicken|mutton|fish|prawns?|shrimps?|crab|meat|meatballs?|keema|kheema|beef|pork|lamb|"
    r"tuna|salmon|sardines?|bacon|sausages?|ham|liver|mince|minced|gosht|machli|shammi|"
    r"bolognese|fillet|boti|roghan josh|rogan josh)\b",
    re.I,
)

# Regional/named dishes that are unambiguously non-veg but don't contain any
# of the generic keywords above. Curated by hand since the dataset carries
# no diet column; check this before the regex so these can't be missed.
_NON_VEG_NAMES = {
    "roghan josh", "boti kebab", "mutton chops", "tandoori chicken",
    "scotch egg",  # contains meat (sausage) despite the name
}
_EGG = re.compile(r"\b(eggs?|anda|omelet|omelette|egg-?nog)\b", re.I)
_DAIRY = re.compile(
    r"\b(milk|milkshake|paneer|curd|dahi|yogurt|yoghurt|cheese|butter|ghee|cream|creamy|khoa|khoya|"
    r"mawa|lassi|raita|kheer|shrikhand|rabri|rasgulla|rasmalai|gulab jamun|chhena|malai|kulfi|"
    r"ice cream|custard|buttermilk|whey)\b",
    re.I,
)

DIET_ALLOWED = {
    "vegan": {"vegan"},
    "vegetarian": {"vegan", "vegetarian"},
    "eggetarian": {"vegan", "vegetarian", "eggetarian"},
    "any": {"vegan", "vegetarian", "eggetarian", "non_veg"},
}


def normalize_diet(value) -> str:
    v = (value or "any").strip().lower().replace("-", "_").replace(" ", "_")
    if v in ("veg", "vegetarian", "pure_veg", "lacto_vegetarian"):
        return "vegetarian"
    if v in ("vegan", "plant_based"):
        return "vegan"
    if v in ("egg", "eggetarian", "ovo_vegetarian", "ovo"):
        return "eggetarian"
    return "any"


def diet_tag(food_name: str) -> str:
    name = food_name or ""
    lname = name.lower()
    if any(n in lname for n in _NON_VEG_NAMES) or _NON_VEG.search(name):
        return "non_veg"
    if _EGG.search(name):
        return "eggetarian"
    if _DAIRY.search(name):
        return "vegetarian"
    return "vegan"


def allowed_diet_tags(diet) -> set:
    return DIET_ALLOWED[normalize_diet(diet)]


# --------------------------------------------------------------------------
# Meal-role classification, used only by the menu planner
# --------------------------------------------------------------------------
_EXCLUDE = re.compile(
    r"\b(pickle|chutney|powder|sauce|stock|syrup|dressing|jam|squash|dip|masala mix|"
    r"paste|marinade|filling|essence|batter|dough|gravy base|puree|garnish|topping|cordial)\b",
    re.I,
)
_DESSERT = re.compile(
    r"\b(burfi|barfi|ladoo|laddu|halwa|kheer|payasam|cake|biscuits?|cookies?|jamun|rasgulla|rasmalai|"
    r"pudding|ice cream|kulfi|jalebi|pastry|souffle|mousse|custard|brownie|fudge|toffee|chikki|"
    r"sandesh|peda|rabri|shrikhand|mysore pak|sweet)\b",
    re.I,
)
_DRINK = re.compile(r"\b(tea|coffee|lassi|milkshake|shake|smoothie|juice|sharbat|lemonade|panna|buttermilk|chaas|cold drink|kanji|egg nog)\b", re.I)
_SOUP = re.compile(r"\b(soup|consomme|broth)\b", re.I)
_STAPLE = re.compile(r"\b(roti|chapati|phulka|parantha|paratha|naan|rice|pulao|pulav|khichdi|khichri|biryani|bhaat|poori|bhatura|thepla|kulcha|jowar|bajra|ragi)\b", re.I)
_BREAKFAST = re.compile(r"\b(idli|idly|dosa|uttapam|upma|poha|oats|oatmeal|porridge|daliya|dalia|cheela|chilla|appam|puttu|pesarattu|cornflakes|muesli|toast|dhokla|sandwich|sprouts?|paratha|parantha|thepla)\b", re.I)
_SNACK = re.compile(r"\b(chaat|chat|tikki|cutlet|pakora|pakoda|samosa|bhel|sundal|salad|sprouted|sprouts|tikka|shaslik|kabab|kebab|vada|dhokla|makhana|roll)\b", re.I)
_SIDE = re.compile(r"\b(raita|salad|kachumber|soup)\b", re.I)


def meal_role(food_name: str) -> str:
    """Rough role for meal composition: excluded / dessert / drink / staple /
    breakfast / snack / side / main. Purely name-based, documented as heuristic."""
    n = food_name or ""
    if _EXCLUDE.search(n):
        return "excluded"
    if _DESSERT.search(n):
        return "dessert"
    if _DRINK.search(n):
        return "drink"
    if _SIDE.search(n) or _SOUP.search(n):
        return "side"
    if _BREAKFAST.search(n) and not re.search(r"\b(curry|kadhi)\b", n, re.I):
        return "breakfast"
    if _STAPLE.search(n):
        return "staple"
    if _SNACK.search(n):
        return "snack"
    return "main"