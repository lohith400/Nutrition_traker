"""Tests for the speed work: streaming coach, caching, connection reuse, parallel context."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
for p in (ROOT / "backend", ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


# ---------------------------------------------------------------------------
# A fake LLM that streams like the real SDK does
# ---------------------------------------------------------------------------
def _chunk(content=None, tool_calls=None):
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=content, tool_calls=tool_calls))])


def _tc(index, call_id=None, name=None, args=None):
    fn = SimpleNamespace(name=name, arguments=args)
    return SimpleNamespace(index=index, id=call_id, function=fn, model_extra={})


class FakeLLM:
    """`script` is a list of rounds; each round is a list of chunks (stream) or a ('plain', message) tuple."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        rnd = self.script.pop(0)
        if isinstance(rnd, Exception):
            raise rnd
        if kwargs.get("stream"):
            return iter(rnd)
        # non-stream fallback: collapse chunks into one message
        text = "".join(c.choices[0].delta.content or "" for c in rnd)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text, tool_calls=None))])


@pytest.fixture()
def api(monkeypatch):
    for var in ("OPENROUTER_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "LLM_PROVIDER", "LLM_MODEL", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"):
        monkeypatch.setenv(var, "")
    monkeypatch.setenv("NUTRISYNC_NO_SCHEDULER", "1")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db = f.name
    monkeypatch.setenv("NUTRISYNC_DB_PATH", db)
    from backend import db_setup
    db_setup.DB_PATH = db
    db_setup.build_database()
    from backend import google_fit, math_engine, memory_agent, menu_planner, orchestrator, rag_resolver, reminders, custom_foods
    from backend.app import app
    for mod in (math_engine, memory_agent, menu_planner, rag_resolver, google_fit, reminders, custom_foods):
        if hasattr(mod, "DB_PATH"):
            monkeypatch.setattr(mod, "DB_PATH", db, raising=False)
    rag_resolver._index_cache.update(key=None, rows=[])
    tc = TestClient(app)
    tc.post("/api/profile/onboarding", json={
        "name": "T", "age": 25, "sex": "male", "height_cm": 175, "current_weight_kg": 70, "target_weight_kg": 68,
        "goal": "fat_loss", "activity_level": "casual", "allergies": "", "medical_conditions": "", "sleep_schedule": "",
        "diet": "any"})
    yield SimpleNamespace(client=tc, orch=orchestrator, memory=memory_agent, monkeypatch=monkeypatch)
    try:
        os.remove(db)
    except OSError:
        pass


def _events(resp):
    return [json.loads(line) for line in resp.text.splitlines() if line.strip()]


def test_stream_plain_reply_arrives_in_pieces(api):
    llm = FakeLLM([[_chunk("Hello "), _chunk("there, "), _chunk("friend!")]])
    api.monkeypatch.setattr(api.orch, "client", llm)
    r = api.client.post("/api/chat/stream", json={"message": "hi"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    ev = _events(r)
    assert ev[0]["type"] == "start"
    deltas = [e["text"] for e in ev if e["type"] == "delta"]
    assert deltas == ["Hello ", "there, ", "friend!"]
    done = ev[-1]
    assert done["type"] == "done" and done["reply"] == "Hello there, friend!"
    assert "overview" in done and "recent_meals" in done and done["tool_events"] == []
    # the transcript was stored in order: user message first, then the coach
    hist = api.memory.get_chat_history()
    assert [h["role"] for h in hist][-2:] == ["user", "assistant"]
    assert hist[-1]["content"] == "Hello there, friend!"


def test_stream_runs_tool_then_streams_answer(api):
    rounds = [
        [_chunk(tool_calls=[_tc(0, "c1", "lookup_food", '{"item_name": "id')]),
         _chunk(tool_calls=[_tc(0, None, None, 'li", "quantity": 2}')])],
        [_chunk("2 idlis "), _chunk("are about 140 kcal.")],
    ]
    llm = FakeLLM(rounds)
    api.monkeypatch.setattr(api.orch, "client", llm)
    ev = _events(api.client.post("/api/chat/stream", json={"message": "I had 2 idli"}))
    types = [e["type"] for e in ev]
    assert types.index("tool_start") < types.index("tool_end") < types.index("delta")
    start = next(e for e in ev if e["type"] == "tool_start")
    assert start["name"] == "lookup_food" and start["args"]["item_name"] == "idli"
    done = ev[-1]
    assert done["type"] == "done" and done["reply"] == "2 idlis are about 140 kcal."
    assert done["tool_events"][0]["tool"] == "lookup_food"
    # the second request to the model carried the tool result
    assert any(m.get("role") == "tool" for m in llm.calls[1]["messages"])


def test_stream_handles_gemini_style_parallel_calls_sharing_index_zero(api):
    rounds = [
        [_chunk(tool_calls=[_tc(0, "a", "lookup_food", '{"item_name": "idli"}')]),
         _chunk(tool_calls=[_tc(0, "b", "lookup_food", '{"item_name": "dosa"}')])],
        [_chunk("Both found.")],
    ]
    api.monkeypatch.setattr(api.orch, "client", FakeLLM(rounds))
    ev = _events(api.client.post("/api/chat/stream", json={"message": "idli and dosa"}))
    names = [e["args"]["item_name"] for e in ev if e["type"] == "tool_start"]
    assert names == ["idli", "dosa"]
    assert ev[-1]["reply"] == "Both found."


def test_stream_false_logging_claim_is_caught_and_retried(api):
    rounds = [
        [_chunk("I've logged "), _chunk("your idli to your meals.")],   # claims a log that never happened
        [_chunk("Sorry, nothing was saved yet. Which meal?")],
    ]
    llm = FakeLLM(rounds)
    api.monkeypatch.setattr(api.orch, "client", llm)
    ev = _events(api.client.post("/api/chat/stream", json={"message": "yes log it"}))
    types = [e["type"] for e in ev]
    assert "reset" in types, "the false claim must be taken back on screen"
    assert ev[-1]["reply"] == "Sorry, nothing was saved yet. Which meal?"
    assert any("has not succeeded" in str(m.get("content")) for m in llm.calls[1]["messages"] if m.get("role") == "system")


def test_stream_falls_back_to_normal_call_when_streaming_unsupported(api):
    llm = FakeLLM([RuntimeError("stream not supported"), [_chunk("Fallback answer.")]])
    api.monkeypatch.setattr(api.orch, "client", llm)
    ev = _events(api.client.post("/api/chat/stream", json={"message": "hi"}))
    assert ev[-1]["type"] == "done" and ev[-1]["reply"] == "Fallback answer."
    assert llm.calls[0].get("stream") is True and not llm.calls[1].get("stream")


def test_stream_reports_provider_failure_as_error_event(api):
    llm = FakeLLM([RuntimeError("boom"), RuntimeError("boom again")])
    api.monkeypatch.setattr(api.orch, "client", llm)
    ev = _events(api.client.post("/api/chat/stream", json={"message": "hi"}))
    assert ev[-1]["type"] == "error" and "Coach provider error" in ev[-1]["detail"]


def test_stream_validation_errors_are_normal_http_errors(api):
    api.monkeypatch.setattr(api.orch, "client", FakeLLM([]))
    assert api.client.post("/api/chat/stream", json={"message": "   "}).status_code == 422
    assert api.client.post("/api/chat/stream", json={"message": "x", "image": "data:text/html;base64,AA"}).status_code == 422
    api.monkeypatch.setattr(api.orch, "client", None)
    assert api.client.post("/api/chat/stream", json={"message": "hi"}).status_code == 503


def test_plain_chat_endpoint_still_works_and_matches(api):
    msg = SimpleNamespace(content="Plain reply.", tool_calls=None)
    llm = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=lambda **kw: SimpleNamespace(choices=[SimpleNamespace(message=msg)]))))
    api.monkeypatch.setattr(api.orch, "client", llm)
    body = api.client.post("/api/chat", json={"message": "hello"}).json()
    assert body["reply"] == "Plain reply." and "overview" in body and "recent_meals" in body
    assert [h["role"] for h in api.memory.get_chat_history()][-2:] == ["user", "assistant"]


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------
def test_profile_cache_is_cleared_when_profile_changes(api, monkeypatch):
    from backend import perf
    monkeypatch.setenv("NUTRISYNC_CACHE", "1")
    perf.clear()
    assert api.memory.get_user_profile()["name"] == "T"
    # a write that bypasses the cache would be invisible; the real writer must clear it
    api.client.post("/api/profile/onboarding", json={
        "name": "Renamed", "age": 25, "sex": "male", "height_cm": 175, "current_weight_kg": 70, "target_weight_kg": 68,
        "goal": "fat_loss", "activity_level": "casual", "allergies": "", "medical_conditions": "", "sleep_schedule": "",
        "diet": "any"})
    assert api.memory.get_user_profile()["name"] == "Renamed"
    monkeypatch.setenv("NUTRISYNC_CACHE", "0")


def test_cache_returns_copies_and_expires(monkeypatch):
    from backend import perf
    monkeypatch.setenv("NUTRISYNC_CACHE", "1")
    perf.clear()
    calls = []

    def loader():
        calls.append(1)
        return {"a": [1]}

    first = perf.cached("k", loader, ttl=0.15)
    first["a"].append(99)                      # mutating the caller's copy must not poison the cache
    assert perf.cached("k", loader, ttl=0.15) == {"a": [1]}
    assert len(calls) == 1
    time.sleep(0.2)
    perf.cached("k", loader, ttl=0.15)
    assert len(calls) == 2


def test_cache_is_off_for_plain_local_database(monkeypatch):
    from backend import perf
    monkeypatch.setenv("NUTRISYNC_CACHE", "")
    monkeypatch.setenv("TURSO_DATABASE_URL", "")
    perf.clear()
    n = []
    perf.cached("z", lambda: n.append(1) or 1)
    perf.cached("z", lambda: n.append(1) or 1)
    assert len(n) == 2


def test_parallel_runs_together_and_keeps_order():
    from backend import perf
    t0 = time.time()
    out = perf.parallel(lambda: (time.sleep(0.3), "a")[1], lambda: (time.sleep(0.3), "b")[1], lambda: (time.sleep(0.3), "c")[1])
    assert out == ["a", "b", "c"]
    assert time.time() - t0 < 0.75  # three 0.3 s jobs in well under 0.9 s


def test_parallel_raises_first_error_after_all_finish():
    from backend import perf
    done = []

    def bad():
        raise ValueError("nope")

    def slow():
        time.sleep(0.1)
        done.append(1)

    with pytest.raises(ValueError):
        perf.parallel(bad, slow)
    assert done == [1]


def test_context_has_everything_the_coach_needs(api):
    ctx = api.orch._context()
    assert set(ctx) == {"profile", "budget", "meals", "detected_patterns", "known_facts", "daily_fitness"}
    assert ctx["profile"]["name"] == "T"
    assert "remaining_calories" in ctx["budget"]


# ---------------------------------------------------------------------------
# Connection reuse (exercised on a local file through the same wrapper Turso uses)
# ---------------------------------------------------------------------------
@pytest.fixture()
def libsql_db(tmp_path, monkeypatch):
    pytest.importorskip("libsql")
    from backend import database
    path = str(tmp_path / "pool.db")
    monkeypatch.setenv("NUTRISYNC_FORCE_LIBSQL", "1")
    monkeypatch.setenv("NUTRISYNC_DB_PATH", path)
    monkeypatch.setenv("NUTRISYNC_DB_POOL", "1")
    c = database.get_db_connection()
    c.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
    c.commit()
    c.close()
    return database


def test_pool_reuses_one_connection_per_thread(libsql_db):
    a = libsql_db.get_db_connection()
    raw_a = a._raw
    a.close()
    b = libsql_db.get_db_connection()
    assert b._raw is raw_a
    b.close()


def test_pool_gives_a_fresh_connection_when_one_is_already_in_use(libsql_db):
    outer = libsql_db.get_db_connection()
    outer.execute("INSERT INTO t (v) VALUES ('pending')")        # uncommitted
    inner = libsql_db.get_db_connection()
    assert inner._raw is not outer._raw
    inner.close()                                                # its rollback must not undo outer's work
    outer.commit()
    outer.close()
    check = libsql_db.get_db_connection()
    assert check.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 1
    check.close()


def test_pool_drops_a_connection_idle_too_long(libsql_db, monkeypatch):
    monkeypatch.setenv("NUTRISYNC_DB_POOL_IDLE", "0.05")
    a = libsql_db.get_db_connection()
    raw_a = a._raw
    a.close()
    time.sleep(0.12)
    b = libsql_db.get_db_connection()
    assert b._raw is not raw_a
    b.close()


def test_pooled_close_still_rolls_back_unfinished_work(libsql_db):
    a = libsql_db.get_db_connection()
    a.execute("INSERT INTO t (v) VALUES ('never committed')")
    a.close()
    b = libsql_db.get_db_connection()
    assert b.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0
    b.close()


def test_pool_can_be_switched_off(libsql_db, monkeypatch):
    monkeypatch.setenv("NUTRISYNC_DB_POOL", "0")
    a = libsql_db.get_db_connection()
    assert a._pool_key is None
    a.close()
