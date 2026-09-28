"""Restaurant finder used by the coach's `find_restaurants` tool.

Two data sources, chosen automatically:
  * No key needed (default): OpenStreetMap -- Overpass API for places near a
    point and Nominatim to turn an area name into coordinates. Free, no card.
    It has name, address, cuisine, hours, website and (where mappers tagged it)
    vegetarian info, but NO ratings and NO menus.
  * Optional: Google Places (New), used only if GOOGLE_MAPS_API_KEY is set in
    backend/.env. Adds ratings, price level and open-now.

Neither source provides menus. Every result carries a Google Maps link (a plain
search URL, no API key) where the user can see ratings, photos and the menu,
and the coach adds dish ideas from the NutriSync food database.
"""
import json
import math
import os
import re
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.displayName", "places.formattedAddress", "places.rating", "places.userRatingCount",
    "places.priceLevel", "places.currentOpeningHours.openNow", "places.googleMapsUri",
    "places.websiteUri", "places.servesVegetarianFood", "places.editorialSummary",
    "places.primaryTypeDisplayName", "places.location",
])
PRICE = {
    "PRICE_LEVEL_INEXPENSIVE": "₹", "PRICE_LEVEL_MODERATE": "₹₹",
    "PRICE_LEVEL_EXPENSIVE": "₹₹₹", "PRICE_LEVEL_VERY_EXPENSIVE": "₹₹₹₹",
}


def is_configured() -> bool:
    return bool(os.getenv("GOOGLE_MAPS_API_KEY"))


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


_PURE_VEG_NAME = re.compile(r"\bpure[\s-]*veg|\bveg(etarian)?\b(?!.*non)|\bshuddh|\bsattvik|\bjain\b", re.I)
_NON_VEG_NAME = re.compile(r"non[\s-]*veg|biryani|kebab|tandoor|grill|chicken|mutton|fish|seafood|meat|bbq|barbecue", re.I)


def _search_google(query: str = "", diet_filter: str = "any", area: str = "",
                   lat: float | None = None, lng: float | None = None,
                   limit: int = 5, radius_m: int = 5000) -> dict:
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not key:
        return {"status": "not_configured",
                "message": "Restaurant search needs GOOGLE_MAPS_API_KEY in backend/.env (Places API New enabled)."}

    base = (query or "").strip() or "restaurants"
    if diet_filter == "veg":
        text = f"pure vegetarian restaurant {base}" if base != "restaurants" else "pure vegetarian restaurant"
    elif diet_filter == "non_veg":
        text = f"non veg restaurant {base}" if base != "restaurants" else "non veg restaurant"
    else:
        text = base
    if area:
        text = f"{text} in {area}"

    body = {"textQuery": text, "maxResultCount": 20, "languageCode": "en", "regionCode": "IN"}
    use_location = lat is not None and lng is not None
    if use_location and not area:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius_m)}}

    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "")
        except Exception:
            detail = ""
        return {"status": "error", "error": f"Google Places error {exc.code}. {detail}".strip()}
    except Exception as exc:  # network, timeout, bad JSON
        return {"status": "error", "error": f"Could not reach Google Places: {exc}"}

    results = []
    for p in data.get("places", []):
        name = (p.get("displayName") or {}).get("text", "")
        if not name:
            continue
        serves_veg = p.get("servesVegetarianFood")
        if diet_filter == "veg":
            # Google only says "serves vegetarian food", not "100% veg". Prefer explicit
            # veg names; otherwise accept places Google confirms serve veg food.
            if not (_PURE_VEG_NAME.search(name) or serves_veg):
                continue
        elif diet_filter == "non_veg":
            if _PURE_VEG_NAME.search(name) and not _NON_VEG_NAME.search(name):
                continue
        loc = p.get("location") or {}
        dist = None
        if use_location and "latitude" in loc:
            dist = int(_haversine_m(lat, lng, loc["latitude"], loc["longitude"]))
        count = p.get("userRatingCount") or 0
        results.append({
            "name": name,
            "type": (p.get("primaryTypeDisplayName") or {}).get("text"),
            "address": p.get("formattedAddress"),
            "rating": p.get("rating"),
            "rating_count": count,
            "price": PRICE.get(p.get("priceLevel", ""), None),
            "open_now": (p.get("currentOpeningHours") or {}).get("openNow"),
            "distance_m": dist,
            "serves_vegetarian": serves_veg,
            "likely_pure_veg": bool(_PURE_VEG_NAME.search(name)),
            "summary": (p.get("editorialSummary") or {}).get("text"),
            "maps_url": p.get("googleMapsUri"),
            "website": p.get("websiteUri"),
        })

    # Keep reasonably reviewed places first, best rated first; within radius when we know where the user is.
    if use_location and not area:
        near = [r for r in results if r["distance_m"] is None or r["distance_m"] <= radius_m * 1.5]
        results = near or results
    def _rank(r):
        # Google can't tell "pure veg" or "non-veg specialist" apart, so use the name as a hint:
        # veg requests list veg-named places first, non-veg requests list non-veg-named places first.
        if diet_filter == "veg":
            hint = r["likely_pure_veg"]
        elif diet_filter == "non_veg":
            hint = bool(_NON_VEG_NAME.search(r["name"]))
        else:
            hint = False
        return (hint, (r["rating_count"] or 0) >= 20, r["rating"] or 0, r["rating_count"] or 0)

    results.sort(key=_rank, reverse=True)
    results = results[:limit]
    if not results:
        return {"status": "no_results", "message": "No matching restaurants found nearby. Try a wider area or different dish."}
    return {"status": "ok", "search": text, "restaurants": results}



# ---------------------------------------------------------------------------
# OpenStreetMap (no API key)
# ---------------------------------------------------------------------------
OVERPASS = "https://overpass-api.de/api/interpreter"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "NutriSync/0.4 (personal nutrition tracker)"
_NON_VEG_CUISINE = re.compile(r"biryani|kebab|barbecue|bbq|chicken|seafood|steak|grill|burger|mughlai|meat", re.I)
_VEG_CUISINE = re.compile(r"vegetarian|vegan|udupi|south_indian|jain", re.I)
_GENERIC_QUERY = {"", "restaurants", "restaurant", "hotel", "hotels", "food", "places to eat"}


def _http_json(url: str, data: bytes | None = None, timeout: int = 25):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _geocode(area: str):
    url = NOMINATIM + "?" + urllib.parse.urlencode({"q": area, "format": "json", "limit": 1, "countrycodes": "in"})
    data = _http_json(url, timeout=12)
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def _osm_address(tags: dict) -> str:
    parts = [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:suburb"), tags.get("addr:city")]
    return ", ".join(p for p in parts if p)


def _maps_link(name: str, address: str, lat: float, lng: float) -> str:
    q = f"{name} {address}".strip() if address else f"{name} {lat},{lng}"
    return "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(q)


def _search_osm(query: str, diet_filter: str, area: str, lat, lng, limit: int, radius_m: int) -> dict:
    try:
        if area:
            point = _geocode(area)
            if not point:
                return {"status": "no_results", "message": f"Couldn't find the area '{area}'. Try a more specific place name."}
            lat, lng = point
    except Exception as exc:
        return {"status": "error", "error": f"Could not look up that area: {exc}"}
    if lat is None or lng is None:
        return {"status": "need_location", "message": "No location available."}

    elements = []
    for radius in (radius_m, int(radius_m * 2.5)):
        overpass_q = (
            '[out:json][timeout:20];'
            f'nwr["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]["name"](around:{int(radius)},{lat},{lng});'
            'out center tags 200;'
        )
        try:
            data = _http_json(OVERPASS, data=urllib.parse.urlencode({"data": overpass_q}).encode("utf-8"))
        except Exception as exc:
            return {"status": "error", "error": f"Could not reach the OpenStreetMap service right now: {exc}"}
        elements = data.get("elements", [])
        if len(elements) >= 8:
            break

    generic = (query or "").strip().lower() in _GENERIC_QUERY
    places = []
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        plat = el.get("lat") if "lat" in el else (el.get("center") or {}).get("lat")
        plng = el.get("lon") if "lon" in el else (el.get("center") or {}).get("lon")
        if plat is None or plng is None:
            continue
        cuisine = (tags.get("cuisine") or "").replace(";", ", ").replace("_", " ")
        diet_tag = tags.get("diet:vegetarian")
        pure_veg = diet_tag == "only" or bool(_PURE_VEG_NAME.search(name))
        serves_veg = pure_veg or diet_tag == "yes" or bool(_VEG_CUISINE.search(tags.get("cuisine", "")))
        nonveg_hint = bool(_NON_VEG_NAME.search(name)) or bool(_NON_VEG_CUISINE.search(tags.get("cuisine", "")))
        if diet_filter == "veg" and not serves_veg:
            continue
        if diet_filter == "non_veg" and (diet_tag == "only" or (pure_veg and not nonveg_hint)):
            continue
        addr = _osm_address(tags)
        places.append({
            "name": name,
            "type": (tags.get("amenity") or "").replace("_", " ").title() or None,
            "address": addr or None,
            "rating": None, "rating_count": 0, "price": None, "open_now": None,
            "hours": tags.get("opening_hours"),
            "distance_m": int(_haversine_m(lat, lng, plat, plng)),
            "serves_vegetarian": True if serves_veg else None,
            "likely_pure_veg": pure_veg,
            "summary": (f"Cuisine: {cuisine}" if cuisine else None),
            "maps_url": _maps_link(name, addr, plat, plng),
            "website": tags.get("website") or tags.get("contact:website"),
            "_nonveg": nonveg_hint,
            "_haystack": f"{name} {cuisine}".lower(),
        })

    note = None
    if not generic and places:
        q = query.strip().lower()
        matched = [p for p in places if q in p["_haystack"]]
        if matched:
            places = matched
        else:
            note = f"No place is tagged '{query}' in the map data, so these are nearby restaurants in general."

    places.sort(key=lambda p: (not (p["likely_pure_veg"] if diet_filter == "veg" else p["_nonveg"] if diet_filter == "non_veg" else False), p["distance_m"]))
    for p in places:
        p.pop("_nonveg", None); p.pop("_haystack", None)
    places = places[:limit]
    if not places:
        return {"status": "no_results", "message": "No matching restaurants found nearby in the map data. Try a wider area or a different dish."}
    out = {"status": "ok", "source": "openstreetmap", "restaurants": places,
           "ratings_note": "This source has no ratings or menus; the Maps link shows ratings, photos and the menu."}
    if note:
        out["note"] = note
    return out


def search_restaurants(query: str = "", diet_filter: str = "any", area: str = "",
                       lat: float | None = None, lng: float | None = None,
                       limit: int = 5, radius_m: int = 3000) -> dict:
    """Uses Google Places when GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap (free, no key)."""
    if is_configured():
        result = _search_google(query, diet_filter, area, lat, lng, limit, max(radius_m, 5000))
        if result.get("status") in ("ok", "no_results"):
            result.setdefault("source", "google")
            return result
        # Bad key / billing off / network error: fall back to the free source instead of failing.
    return _search_osm(query, diet_filter, area, lat, lng, limit, radius_m)