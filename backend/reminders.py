"""
Reminders
==========
Time-based reminders for food and water.

  * A reminder is "at HH:MM, eat <food>" or "at HH:MM, drink <N> ml water".
  * A background thread (started by app.py) checks every few seconds. When a
    reminder is due it (optionally) auto-logs the food/water, records an event
    for the website, and pushes a notification to your phone / inbox.

Notification channels (all free, all optional, configured in backend/.env):
  * ntfy.sh  -> real push notification on your phone (NTFY_TOPIC)
  * Email    -> any SMTP server, e.g. Gmail with an App Password (SMTP_*)
  * Website  -> the open browser tab polls /api/reminders/events (always on)

Times use the server's local clock (datetime.now()), the same clock the rest of
NutriSync uses for log dates. Set TZ=Asia/Kolkata for Docker / cloud servers.
"""

import os
import re
import smtplib
import threading
import urllib.request
from datetime import datetime, timedelta
from email.message import EmailMessage

try:
    from backend import math_engine, memory_agent, rag_resolver
except ImportError:  # running from inside backend/
    import math_engine, memory_agent, rag_resolver

# A reminder that is more than this many minutes late (server was off / asleep)
# is skipped instead of fired, so restarting at 9pm never logs your breakfast.
GRACE_MINUTES = int(os.getenv("REMINDER_GRACE_MINUTES", "15"))
POLL_SECONDS = 15

_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")


def _get_conn():
    return memory_agent._get_conn()


def _ensure_tables(conn) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS reminders (
               id              INTEGER PRIMARY KEY AUTOINCREMENT,
               kind            TEXT NOT NULL,            -- 'food' | 'water'
               remind_time     TEXT NOT NULL,            -- 'HH:MM' (24h)
               repeat          TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'once'
               once_date       TEXT,                     -- for repeat='once'
               food_name       TEXT,
               quantity        REAL,
               unit            TEXT DEFAULT 'serving',
               meal_type       TEXT,
               water_l         REAL,
               auto_log        INTEGER NOT NULL DEFAULT 1,
               enabled         INTEGER NOT NULL DEFAULT 1,
               last_fired_date TEXT,
               created_at      TEXT NOT NULL
           )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS reminder_events (
               id          INTEGER PRIMARY KEY AUTOINCREMENT,
               reminder_id INTEGER,
               fired_at    TEXT NOT NULL,
               title       TEXT NOT NULL,
               message     TEXT NOT NULL,
               logged      INTEGER NOT NULL DEFAULT 0,
               channels    TEXT DEFAULT ''
           )"""
    )


def _open():
    conn = _get_conn()
    _ensure_tables(conn)
    return conn


# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------

def channel_status() -> dict:
    return {
        "ntfy": bool(os.getenv("NTFY_TOPIC")),
        "email": bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD") and (os.getenv("NOTIFY_EMAIL_TO") or os.getenv("SMTP_USER"))),
        "browser": True,
    }


def _send_ntfy(title: str, body: str) -> None:
    topic = os.getenv("NTFY_TOPIC", "").strip()
    server = os.getenv("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    req = urllib.request.Request(
        f"{server}/{topic}",
        data=body.encode("utf-8"),
        method="POST",
        headers={
            # HTTP headers must be latin-1, so keep the title plain ASCII.
            "Title": title.encode("ascii", "ignore").decode() or "NutriSync",
            "Tags": "alarm_clock",
            "Priority": "default",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def _send_email(title: str, body: str) -> None:
    user = os.getenv("SMTP_USER", "")
    to = os.getenv("NOTIFY_EMAIL_TO") or user
    msg = EmailMessage()
    msg["Subject"] = title
    msg["From"] = user
    msg["To"] = to
    msg.set_content(body)
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(user, os.getenv("SMTP_PASSWORD", ""))
        smtp.send_message(msg)


def send_notifications(title: str, body: str) -> dict:
    """Send to every configured channel. Never raises; reports per channel."""
    status = channel_status()
    sent, errors = [], {}
    for name, fn in (("ntfy", _send_ntfy), ("email", _send_email)):
        if not status[name]:
            continue
        try:
            fn(title, body)
            sent.append(name)
        except Exception as exc:  # network down, bad credentials, ...
            errors[name] = str(exc)[:200]
    return {"sent": sent, "errors": errors}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def _guess_meal_type(hhmm: str) -> str:
    minutes = int(hhmm[:2]) * 60 + int(hhmm[3:])
    if minutes < 11 * 60:
        return "breakfast"
    if minutes < 15 * 60 + 30:
        return "lunch"
    if minutes < 19 * 60:
        return "snack"
    return "dinner"


def _normalize_time(value: str) -> str | None:
    m = _TIME_RE.match((value or "").strip())
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _row(r) -> dict:
    d = dict(r)
    d["auto_log"] = bool(d["auto_log"])
    d["enabled"] = bool(d["enabled"])
    return d


def create_reminder(kind: str, remind_time: str, repeat: str = "daily", food_name: str | None = None,
                    quantity: float = 1.0, unit: str = "serving", meal_type: str | None = None,
                    water_ml: float | None = None, auto_log: bool = True) -> dict:
    """Validate and store a reminder. Returns {"status": "created", "reminder": {...}}
    or {"status": "error", "error": "..."}."""
    hhmm = _normalize_time(remind_time)
    if not hhmm:
        return {"status": "error", "error": "Time must be 24-hour HH:MM, e.g. 14:00."}
    if kind not in ("food", "water"):
        return {"status": "error", "error": "kind must be 'food' or 'water'."}
    if repeat not in ("daily", "once"):
        return {"status": "error", "error": "repeat must be 'daily' or 'once'."}

    stored_food, water_l = None, None
    if kind == "food":
        name = (food_name or "").strip()
        if not name:
            return {"status": "error", "error": "Tell me which food to remind you about."}
        if unit not in ("serving", "grams"):
            unit = "serving"
        try:
            quantity = float(quantity or 1)
        except (TypeError, ValueError):
            quantity = 1.0
        if not 0 < quantity <= 2000:
            return {"status": "error", "error": "Quantity looks wrong."}
        match = rag_resolver.resolve_food(name, diet=memory_agent.get_user_diet())
        if match.get("status") == "diet_mismatch":
            return {"status": "error", "error": f"'{name}' doesn't fit your {match.get('diet')} diet."}
        if match.get("status") != "matched":
            return {"status": "error", "error": f"Couldn't find '{name}' in the food database, so it can't be auto-logged. Try a simpler name."}
        stored_food = name
        meal_type = meal_type if meal_type in MEAL_TYPES else _guess_meal_type(hhmm)
    else:
        try:
            ml = float(water_ml if water_ml is not None else 250)
        except (TypeError, ValueError):
            return {"status": "error", "error": "Water amount looks wrong."}
        if not 50 <= ml <= 2000:
            return {"status": "error", "error": "Water amount must be between 50 and 2000 ml."}
        water_l = round(ml / 1000, 3)
        quantity, unit, meal_type = None, None, None

    now = datetime.now()
    once_date = None
    if repeat == "once":
        due_today = datetime.strptime(f"{now:%Y-%m-%d} {hhmm}", "%Y-%m-%d %H:%M")
        once_date = (now if due_today >= now else now + timedelta(days=1)).strftime("%Y-%m-%d")

    conn = _open()
    cur = conn.execute(
        """INSERT INTO reminders (kind, remind_time, repeat, once_date, food_name, quantity, unit,
                                  meal_type, water_l, auto_log, enabled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (kind, hhmm, repeat, once_date, stored_food, quantity, unit, meal_type, water_l,
         1 if auto_log else 0, now.strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM reminders WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return {"status": "created", "reminder": _row(row)}


def list_reminders() -> list:
    conn = _open()
    rows = conn.execute("SELECT * FROM reminders ORDER BY remind_time, id").fetchall()
    conn.close()
    return [_row(r) for r in rows]


def set_enabled(reminder_id: int, enabled: bool) -> bool:
    conn = _open()
    cur = conn.execute("UPDATE reminders SET enabled = ? WHERE id = ?", (1 if enabled else 0, reminder_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def delete_reminder(reminder_id: int) -> bool:
    conn = _open()
    cur = conn.execute("DELETE FROM reminders WHERE id = ?", (reminder_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_events(since_id: int = 0, limit: int = 30) -> list:
    conn = _open()
    rows = conn.execute(
        "SELECT * FROM reminder_events WHERE id > ? ORDER BY id DESC LIMIT ?", (since_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Firing
# ---------------------------------------------------------------------------

def _auto_log_food(r: dict) -> dict:
    match = rag_resolver.resolve_food(r["food_name"], diet=memory_agent.get_user_diet())
    if match.get("status") != "matched":
        return {"ok": False, "error": f"food '{r['food_name']}' no longer matches the database"}
    macros = math_engine.calculate_meal_macros(match["matched_food_code"], r["quantity"], r["unit"])
    if "error" in macros:
        return {"ok": False, "error": macros["error"]}
    memory_agent.log_meal(r["meal_type"], match["matched_food_code"], macros["food_name"], r["quantity"],
                          macros["calories"], macros["protein_g"], macros["carbs_g"], macros["fat_g"],
                          unit=macros["unit"], serving_label=macros.get("serving_label"))
    return {"ok": True, "macros": macros}


def _describe(r: dict) -> str:
    if r["kind"] == "water":
        return f"{round(r['water_l'] * 1000)} ml of water"
    amount = f"{r['quantity']:g} g" if r["unit"] == "grams" else f"{r['quantity']:g} serving{'' if r['quantity'] == 1 else 's'}"
    return f"{r['food_name']} ({amount})"


def fire_reminder(r: dict, notify: bool = True) -> dict:
    """Run one reminder: auto-log (if enabled), record an event, notify."""
    what = _describe(r)
    logged, detail = False, ""
    if r["auto_log"]:
        if r["kind"] == "water":
            memory_agent.log_water(r["water_l"])
            logged, detail = True, "Logged to your water intake."
        else:
            result = _auto_log_food(r)
            if result["ok"]:
                m = result["macros"]
                logged = True
                detail = f"Logged as {r['meal_type']}: {m['calories']} kcal, {m['protein_g']}g protein."
            else:
                detail = f"Could not auto-log: {result['error']}"
    verb = "Drink" if r["kind"] == "water" else "Time to eat"
    title = "NutriSync: water time" if r["kind"] == "water" else "NutriSync: meal time"
    message = f"{verb} {what}." + (f" {detail}" if detail else "")

    delivery = send_notifications(title, message) if notify else {"sent": [], "errors": {}}
    conn = _open()
    conn.execute(
        "INSERT INTO reminder_events (reminder_id, fired_at, title, message, logged, channels) VALUES (?, ?, ?, ?, ?, ?)",
        (r["id"], datetime.now().strftime("%Y-%m-%d %H:%M:%S"), title, message, 1 if logged else 0, ",".join(delivery["sent"])),
    )
    conn.commit()
    conn.close()
    return {"title": title, "message": message, "logged": logged, **delivery}


def run_due(now: datetime | None = None) -> list:
    """Fire everything due at `now`. Safe to call repeatedly."""
    now = now or datetime.now()
    today = now.strftime("%Y-%m-%d")
    fired = []
    conn = _open()
    rows = conn.execute("SELECT * FROM reminders WHERE enabled = 1").fetchall()
    for row in rows:
        r = _row(row)
        if r["repeat"] == "once" and r["once_date"] and r["once_date"] < today:
            conn.execute("UPDATE reminders SET enabled = 0 WHERE id = ?", (r["id"],))  # missed while offline
            continue
        if r["repeat"] == "once" and r["once_date"] != today:
            continue
        if r["last_fired_date"] == today:
            continue
        scheduled = datetime.strptime(f"{today} {r['remind_time']}", "%Y-%m-%d %H:%M")
        if now < scheduled:
            continue
        # Claim this run atomically so two threads/processes can never double-fire.
        claimed = conn.execute(
            "UPDATE reminders SET last_fired_date = ? WHERE id = ? AND (last_fired_date IS NULL OR last_fired_date != ?)",
            (today, r["id"], today),
        ).rowcount
        conn.commit()
        if not claimed:
            continue
        if r["repeat"] == "once":
            conn.execute("UPDATE reminders SET enabled = 0 WHERE id = ?", (r["id"],))
            conn.commit()
        if now - scheduled > timedelta(minutes=GRACE_MINUTES):
            continue  # too late: skip today rather than log something stale
        try:
            fired.append(fire_reminder(r))
        except Exception as exc:
            print(f"[reminders] failed to fire reminder {r['id']}: {exc}")
    conn.commit()
    conn.close()
    return fired


# ---------------------------------------------------------------------------
# Background scheduler
# ---------------------------------------------------------------------------

_stop = threading.Event()
_thread: threading.Thread | None = None


def _loop() -> None:
    while not _stop.is_set():
        try:
            run_due()
        except Exception as exc:
            print(f"[reminders] scheduler error: {exc}")
        _stop.wait(POLL_SECONDS)


def start_scheduler() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="reminder-scheduler", daemon=True)
    _thread.start()


def stop_scheduler() -> None:
    _stop.set()