"""Unit tests for backend/places_finder.py (haversine math, filters, and mocked API calls)."""
import json
import pytest
from unittest.mock import patch, MagicMock
from backend import places_finder


def test_is_configured(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    assert not places_finder.is_configured()

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "fake_key_123")
    assert places_finder.is_configured()


def test_haversine_distance():
    # Distance between two identical points is 0
    d0 = places_finder._haversine_m(12.9716, 77.5946, 12.9716, 77.5946)
    assert d0 == 0.0

    # Distance between Bangalore and Mysore (~128 km)
    d = places_finder._haversine_m(12.9716, 77.5946, 12.2958, 76.6394)
    assert 120_000 < d < 150_000


def test_veg_and_non_veg_regex():
    assert places_finder._PURE_VEG_NAME.search("Sri Krishna Pure Veg")
    assert places_finder._PURE_VEG_NAME.search("Sattvik Bhojanalaya")
    assert not places_finder._PURE_VEG_NAME.search("Barbeque Nation")

    assert places_finder._NON_VEG_NAME.search("Meghana Biryani")
    assert places_finder._NON_VEG_NAME.search("Empire Kebab Corner")
    assert not places_finder._NON_VEG_NAME.search("Udupi Upahar")


def test_search_google_not_configured(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    res = places_finder._search_google(query="dosa")
    assert res["status"] == "not_configured"


def test_search_google_success(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "fake_key")

    mock_resp_data = {
        "places": [
            {
                "displayName": {"text": "Udupi Pure Veg Hotel"},
                "formattedAddress": "123 Main Road, Indiranagar, Bangalore",
                "rating": 4.5,
                "userRatingCount": 1200,
                "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
                "currentOpeningHours": {"openNow": True},
                "servesVegetarianFood": True,
                "primaryTypeDisplayName": {"text": "South Indian Restaurant"},
                "location": {"latitude": 12.9716, "longitude": 77.5946},
            }
        ]
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_resp_data).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = places_finder._search_google(
            query="dosa", diet_filter="veg", area="Indiranagar", lat=12.97, lng=77.59, limit=5
        )

    assert res["status"] == "ok"
    assert len(res["restaurants"]) == 1
    place = res["restaurants"][0]
    assert place["name"] == "Udupi Pure Veg Hotel"
    assert place["price"] == "₹"
    assert place["likely_pure_veg"] is True


def test_search_google_network_error(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "fake_key")

    with patch("urllib.request.urlopen", side_effect=Exception("Connection timed out")):
        res = places_finder._search_google(query="idli")

    assert res["status"] == "error"
    assert "Could not reach Google Places" in res["error"]


def test_search_restaurants_fallback_to_osm(monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    osm_mock = {
        "status": "ok",
        "source": "osm",
        "results": [{"name": "A2B Veg Restaurant", "price": "₹"}],
    }

    with patch.object(places_finder, "_search_osm", return_value=osm_mock):
        res = places_finder.search_restaurants(query="thali", diet_filter="veg", area="Koramangala")

    assert res["status"] == "ok"
    assert res["source"] == "osm"
    assert len(res["results"]) == 1


def test_osm_helpers():
    tags = {
        "addr:housenumber": "12",
        "addr:street": "100 Feet Rd",
        "addr:city": "Bengaluru",
    }
    addr = places_finder._osm_address(tags)
    assert "100 Feet Rd" in addr
    assert "Bengaluru" in addr

    link = places_finder._maps_link("Udupi Hotel", "Indiranagar", 12.97, 77.59)
    assert "https://www.google.com/maps/search/?api=1&query=" in link


def test_search_osm_flow():
    # Need location
    res_no_loc = places_finder._search_osm(query="dosa", diet_filter="veg", area="", lat=None, lng=None, limit=5, radius_m=1000)
    assert res_no_loc["status"] == "need_location"

    # Area geocode not found
    with patch.object(places_finder, "_geocode", return_value=None):
        res_bad_area = places_finder._search_osm(query="dosa", diet_filter="veg", area="NonExistentPlace", lat=None, lng=None, limit=5, radius_m=1000)
        assert res_bad_area["status"] == "no_results"

    # Successful OSM search with elements
    mock_osm_elements = {
        "elements": [
            {
                "lat": 12.9716,
                "lon": 77.5946,
                "tags": {
                    "name": "Sri Krishna Pure Veg",
                    "amenity": "restaurant",
                    "cuisine": "south_indian",
                    "diet:vegetarian": "yes",
                },
            }
        ]
    }
    with patch.object(places_finder, "_geocode", return_value=(12.97, 77.59)):
        with patch.object(places_finder, "_http_json", return_value=mock_osm_elements):
            res_osm = places_finder._search_osm(query="south indian", diet_filter="veg", area="Indiranagar", lat=12.97, lng=77.59, limit=5, radius_m=1000)

    assert res_osm["status"] == "ok"
    assert len(res_osm["restaurants"]) == 1
    assert res_osm["restaurants"][0]["name"] == "Sri Krishna Pure Veg"
    assert res_osm["restaurants"][0]["likely_pure_veg"] is True


