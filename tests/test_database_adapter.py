"""Tests for the Turso/libsql adapter, migration, chat-context history and the access key.

The libsql driver is exercised on a local file (same Python API as a remote Turso
database), so these run offline.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "backend", ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

libsql = pytest.importorskip("libsql")
from backend import database  # noqa: E402


@pytest.fixture
def conn(tmp_path, monkeypatch):
    monkeypatch.setenv("NUTRISYNC_FORCE_LIBSQL", "1")
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    c = database.get_db_connection(str(tmp_path / "t.db"))
    assert isinstance(c, database.LibsqlConnection)
    yield c
    c.close()


def test_split_statements_ignores_quotes_and_comments():
    script = "CREATE TABLE a (x TEXT DEFAULT 'a;b'); -- note; here\nDROP TABLE a; DROP TABLE b;"
    assert database.split_statements(script) == ["CREATE TABLE a (x TEXT DEFAULT 'a;b')", "DROP TABLE a", "DROP TABLE b"]


def test_named_params_rows_lastrowid_rowcount(conn):
    conn.executescript("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, qty REAL, at TEXT);")
    cur = conn.execute("INSERT INTO t (name, qty, at) VALUES (:name, :qty, '12:30 :x')", {"name": "idli", "qty": 2})
    conn.commit()
    assert cur.lastrowid == 1
    conn.row_factory = object  # any truthy value == sqlite3.Row behaviour
    row = conn.execute("SELECT * FROM t WHERE id = ?", (1,)).fetchone()
    assert row["name"] == "idli" and row[2] == 2 and dict(row)["at"] == "12:30 :x" and row.keys() == ["id", "name", "qty", "at"]
    assert conn.execute("UPDATE t SET qty = 5").rowcount == 1
    assert conn.execute("DELETE FROM t WHERE id = 99").rowcount == 0
    assert conn.execute("SELECT 1 WHERE 1 = 0").fetchone() is None
    conn.row_factory = None
    assert conn.execute("SELECT name FROM t").fetchall() == [("idli",)]


def test_chat_history_persists_and_feeds_context(tmp_path, monkeypatch):
    from backend import memory_agent
    monkeypatch.setenv("NUTRISYNC_FORCE_LIBSQL", "1")
    monkeypatch.setattr(memory_agent, "DB_PATH", str(tmp_path / "chat.db"))
    for i in range(30):
        memory_agent.save_chat_message("user" if i % 2 == 0 else "assistant", f"turn {i}")
    recent = memory_agent.get_recent_history(limit=10)
    assert [m["content"] for m in recent] == [f"turn {i}" for i in range(20, 30)]  # newest 10, oldest first
    assert recent[0]["role"] == "user" and recent[-1]["role"] == "assistant"
    assert len(memory_agent.get_chat_history()) == 30  # nothing lost


def test_migrate_local_db_to_turso(tmp_path, monkeypatch):
    import sqlite3
    from backend import migrate_to_turso

    src = tmp_path / "local.db"
    s = sqlite3.connect(src)
    s.executescript(
        "CREATE TABLE chat_messages (msg_id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT);"
        "CREATE TABLE daily_logs (id INTEGER PRIMARY KEY, food_name TEXT, quantity REAL);"
        "CREATE INDEX idx_logs ON daily_logs(food_name);"
        "INSERT INTO chat_messages (role, content) VALUES ('user', 'hi'), ('assistant', 'hello');"
        "INSERT INTO daily_logs VALUES (7, 'idli', 2.0);"
    )
    s.commit()
    s.close()

    remote_file = str(tmp_path / "fake_turso.db")

    class FakeLibsql:  # stands in for the remote connection
        @staticmethod
        def connect(url, auth_token=None):
            assert url.startswith("libsql://") and auth_token == "tok"
            return libsql.connect(remote_file)

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://x.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "tok")
    monkeypatch.setattr(database, "_import_libsql", lambda: FakeLibsql)
    monkeypatch.setattr(migrate_to_turso, "get_db_connection", database.get_db_connection)
    monkeypatch.setattr(migrate_to_turso, "turso_enabled", database.turso_enabled)
    migrate_to_turso.main(str(src))
    migrate_to_turso.main(str(src))  # idempotent

    d = sqlite3.connect(remote_file)
    assert d.execute("SELECT msg_id, role, content FROM chat_messages ORDER BY msg_id").fetchall() == [(1, "user", "hi"), (2, "assistant", "hello")]
    assert d.execute("SELECT id, food_name, quantity FROM daily_logs").fetchall() == [(7, "idli", 2.0)]


def test_access_key_blocks_api_but_not_health_or_preflight(monkeypatch):
    from fastapi.testclient import TestClient
    from backend import app as app_module

    monkeypatch.setattr(app_module, "ACCESS_KEY", "s3cret")
    c = TestClient(app_module.app, raise_server_exceptions=False)  # a missing DB table would be a 500, not a 401
    assert c.get("/health").status_code == 200
    assert c.get("/api/profile").status_code == 401
    assert c.get("/api/profile", headers={"X-Access-Key": "wrong"}).status_code == 401
    assert c.get("/api/profile", headers={"X-Access-Key": "s3cret"}).status_code != 401

    pre = c.options("/api/chat", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
                                          "Access-Control-Request-Headers": "x-access-key,content-type"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-origin"] == "http://localhost:3000"

    pre_vercel = c.options("/api/chat", headers={"Origin": "https://nutrisync-test.vercel.app", "Access-Control-Request-Method": "POST",
                                                 "Access-Control-Request-Headers": "x-access-key,content-type"})
    assert pre_vercel.status_code == 200 and pre_vercel.headers.get("access-control-allow-origin") == "https://nutrisync-test.vercel.app"

    denied = c.get("/api/profile", headers={"Origin": "http://localhost:3000"})
    assert denied.status_code == 401 and denied.headers["access-control-allow-origin"] == "http://localhost:3000"
    monkeypatch.setattr(app_module, "ACCESS_KEY", "")
    assert c.get("/api/profile").status_code != 401


def test_verify_turso_detects_missing_rows(tmp_path, monkeypatch, capsys):
    import sqlite3
    from backend import migrate_to_turso, verify_turso

    src = tmp_path / "local.db"
    s = sqlite3.connect(src)
    s.executescript("CREATE TABLE daily_logs (id INTEGER PRIMARY KEY, food_name TEXT);"
                    "INSERT INTO daily_logs VALUES (1,'idli'),(2,'dosa');")
    s.commit()
    s.close()
    remote_file = str(tmp_path / "fake_turso.db")

    class FakeLibsql:
        @staticmethod
        def connect(url, auth_token=None):
            return libsql.connect(remote_file)

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://x.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "tok")
    monkeypatch.setattr(database, "_import_libsql", lambda: FakeLibsql)
    for mod in (migrate_to_turso, verify_turso):
        monkeypatch.setattr(mod, "get_db_connection", database.get_db_connection)
        monkeypatch.setattr(mod, "turso_enabled", database.turso_enabled)
    d = database.get_db_connection()
    d.execute("CREATE TABLE daily_logs (id INTEGER PRIMARY KEY, food_name TEXT)")
    d.commit()
    d.close()
    assert verify_turso.main(str(src)) == 1  # nothing copied yet -> FAIL
    migrate_to_turso.main(str(src))
    assert verify_turso.main(str(src)) == 0  # after migration -> PASS
    assert "all tables match" in capsys.readouterr().out


def test_reminders_under_turso_libsql(tmp_path, monkeypatch):
    """Confirm reminders table setup and execution work seamlessly under LibsqlConnection."""
    from datetime import datetime
    from backend import db_setup, memory_agent, reminders

    db_file = str(tmp_path / "turso_reminders.db")
    monkeypatch.setenv("NUTRISYNC_FORCE_LIBSQL", "1")
    monkeypatch.setattr(db_setup, "DB_PATH", db_file)
    monkeypatch.setattr(memory_agent, "DB_PATH", db_file)

    # 1. Confirm db_setup --if-needed / ensure_schema creates the tables
    db_setup.ensure_schema(db_file)
    conn = database.get_db_connection(db_file)
    assert isinstance(conn, database.LibsqlConnection)
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    assert "reminders" in tables and "reminder_events" in tables
    conn.close()

    # 2. Add and list reminders
    water_res = reminders.create_reminder(kind="water", remind_time="14:30", water_ml=300)
    assert water_res["status"] == "created"
    listed = reminders.list_reminders()
    assert len(listed) >= 1
    assert listed[0]["remind_time"] == "14:30"
    assert round(listed[0]["water_l"] * 1000) == 300

    # 3. Test run_due and event logging under LibsqlConnection
    today = datetime.now().strftime("%Y-%m-%d")
    due_time = datetime.strptime(f"{today} 14:31", "%Y-%m-%d %H:%M")
    fired = reminders.run_due(now=due_time)
    assert len(fired) == 1
    assert fired[0]["logged"] is True

    events = reminders.list_events()
    assert len(events) >= 1
    assert events[0]["reminder_id"] == listed[0]["id"]
