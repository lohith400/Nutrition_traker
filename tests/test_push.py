"""Tests for native Web Push notifications (PWA, VAPID)."""
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import py_vapid
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
import base64

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "backend", ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from tests.test_smoke import test_client  # noqa: F401,E402
from backend import reminders


# Test VAPID keys
TEST_PUB_KEY = "BPp2PiFkmdlMg44gg6-SsgeHMmk22CuaST0fGpNhp0N97qfwyLi7ExoU0yZ0jdk9m0wRPdy-cltq4XL11x1Y7es"
TEST_PRIV_KEY = "CF8Q9mqJt_gaXCKWp6VoJOxVIH0c6s07gnWeccDjxV8"
VALID_ENDPOINT = "https://fcm.googleapis.com/fcm/send/test-device-token-12345"
VALID_KEYS = {"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1Xbjhazmc3ng-5Z3AkZsRAf0", "auth": "tBHItJI5svbpez7KI4CCXg"}


@pytest.fixture(autouse=True)
def setup_vapid_env(monkeypatch):
    """Set VAPID keys for push tests and clean up subscriptions."""
    monkeypatch.setenv("VAPID_PUBLIC_KEY", TEST_PUB_KEY)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", TEST_PRIV_KEY)
    monkeypatch.setenv("VAPID_CLAIM_EMAIL", "mailto:test@example.com")
    # Clean subscriptions table
    with reminders._open() as conn:
        conn.execute("DELETE FROM push_subscriptions")
        conn.commit()


def test_vapid_key_generation_and_py_vapid_signing():
    """Verify scripts/generate_vapid_keys.py algorithm produces keys usable by py_vapid."""
    b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
    k = ec.generate_private_key(ec.SECP256R1())
    private = b64u(k.private_numbers().private_value.to_bytes(32, "big"))
    public = b64u(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    assert len(public) > 60
    assert len(private) > 30

    # Verify py_vapid can sign claims using the private key
    v = py_vapid.Vapid.from_string(private)
    claims = {"sub": "mailto:admin@example.com", "aud": "https://fcm.googleapis.com", "exp": 2000000000}
    signed_headers = v.sign(claims)
    assert "Authorization" in signed_headers or "Crypto-Key" in signed_headers


def test_channel_status_contains_no_ntfy(test_client):
    """Verify channels return push, push_devices, email, browser, and no ntfy."""
    status = reminders.channel_status()
    assert "ntfy" not in status
    assert "push" in status
    assert "push_devices" in status
    assert status["push"] is True
    assert status["push_devices"] == 0

    res = test_client.get("/api/reminders").json()
    assert "channels" in res
    assert "ntfy" not in res["channels"]
    assert res["channels"]["push"] is True


def test_push_subscribe_stores_and_upserts(test_client):
    """Subscribe creates subscription and re-subscribing with updated keys upserts without duplicating."""
    payload = {
        "endpoint": VALID_ENDPOINT,
        "keys": VALID_KEYS,
    }
    res = test_client.post("/api/reminders/push/subscribe", json=payload)
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}

    subs = reminders.list_subscriptions()
    assert len(subs) == 1
    assert subs[0]["endpoint"] == VALID_ENDPOINT
    assert subs[0]["p256dh"] == VALID_KEYS["p256dh"]
    assert subs[0]["auth"] == VALID_KEYS["auth"]

    # Upsert with updated key
    updated_payload = {
        "endpoint": VALID_ENDPOINT,
        "keys": {"p256dh": "updated_key_123", "auth": "updated_auth_456"},
    }
    res2 = test_client.post("/api/reminders/push/subscribe", json=updated_payload)
    assert res2.status_code == 200

    subs_after = reminders.list_subscriptions()
    assert len(subs_after) == 1
    assert subs_after[0]["p256dh"] == "updated_key_123"


def test_push_subscribe_validation_errors(test_client):
    """Invalid scheme, non-allowlisted host, and missing fields return 422."""
    # Non-HTTPS
    res = test_client.post("/api/reminders/push/subscribe", json={
        "endpoint": "http://fcm.googleapis.com/fcm/send/123",
        "keys": VALID_KEYS,
    })
    assert res.status_code == 422

    # Non-allowlisted host
    res = test_client.post("/api/reminders/push/subscribe", json={
        "endpoint": "https://attacker.example.com/send/123",
        "keys": VALID_KEYS,
    })
    assert res.status_code == 422

    # Empty keys
    res = test_client.post("/api/reminders/push/subscribe", json={
        "endpoint": VALID_ENDPOINT,
        "keys": {"p256dh": "", "auth": ""},
    })
    assert res.status_code == 422


def test_push_unsubscribe_works(test_client):
    """Unsubscribe removes the endpoint from push_subscriptions."""
    reminders.save_subscription(VALID_ENDPOINT, VALID_KEYS["p256dh"], VALID_KEYS["auth"])
    assert len(reminders.list_subscriptions()) == 1

    res = test_client.post("/api/reminders/push/unsubscribe", json={"endpoint": VALID_ENDPOINT})
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert len(reminders.list_subscriptions()) == 0


def test_test_push_400_when_no_devices_or_no_vapid(test_client, monkeypatch):
    """test-push returns 400 when no devices are registered or VAPID is unconfigured."""
    # No devices
    res = test_client.post("/api/reminders/test-push")
    assert res.status_code == 400
    assert "No devices are subscribed" in res.json()["detail"]

    # Unconfigured VAPID
    reminders.save_subscription(VALID_ENDPOINT, VALID_KEYS["p256dh"], VALID_KEYS["auth"])
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "")
    res = test_client.post("/api/reminders/test-push")
    assert res.status_code == 400
    assert "VAPID keys are not configured" in res.json()["detail"]


def test_410_gone_deletes_subscription(monkeypatch):
    """WebPushException with HTTP 404/410 automatically removes the expired subscription."""
    reminders.save_subscription(VALID_ENDPOINT, VALID_KEYS["p256dh"], VALID_KEYS["auth"])
    assert len(reminders.list_subscriptions()) == 1

    class MockWebPushException(Exception):
        def __init__(self):
            super().__init__("410 Gone")
            self.response = SimpleNamespace(status_code=410)

    import pywebpush
    monkeypatch.setattr(pywebpush, "webpush", MagicMock(side_effect=MockWebPushException()))

    sub = reminders.list_subscriptions()[0]
    ok, err = reminders.send_web_push(sub, {"title": "Test", "body": "Msg"})
    assert ok is False
    assert "expired" in str(err).lower()
    # Subscription should have been deleted
    assert len(reminders.list_subscriptions()) == 0


def test_send_notifications_reports_push_and_sends_email(monkeypatch):
    """send_notifications delivers to push and email and reports both in sent."""
    reminders.save_subscription(VALID_ENDPOINT, VALID_KEYS["p256dh"], VALID_KEYS["auth"])

    import pywebpush
    mock_push = MagicMock()
    monkeypatch.setattr(pywebpush, "webpush", mock_push)

    mock_email = MagicMock()
    monkeypatch.setattr(reminders, "_send_email", mock_email)
    monkeypatch.setenv("SMTP_USER", "user@test.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("NOTIFY_EMAIL_TO", "to@test.com")

    res = reminders.send_notifications("Water Time", "Drink 250 ml")
    assert "push" in res["sent"]
    assert "email" in res["sent"]
    assert res["errors"] == {}
    assert mock_push.called
    assert mock_email.called


def test_fire_reminder_records_event_with_push_channel(monkeypatch):
    """fire_reminder logs event and records push channel in channels column."""
    reminders.save_subscription(VALID_ENDPOINT, VALID_KEYS["p256dh"], VALID_KEYS["auth"])

    import pywebpush
    monkeypatch.setattr(pywebpush, "webpush", MagicMock())

    created = reminders.create_reminder("water", "15:00", water_ml=250)
    reminder_id = created["reminder"]["id"]

    reminders.fire_reminder(created["reminder"], notify=True)

    events = reminders.list_events()
    matching = [e for e in events if e["reminder_id"] == reminder_id]
    assert len(matching) == 1
    assert "push" in matching[0]["channels"]
