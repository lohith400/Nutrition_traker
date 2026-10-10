"""Database connections: local SQLite on your laptop, Turso (cloud SQLite) in production.

    from database import get_db_connection
    conn = get_db_connection()          # same API as sqlite3.connect()

* TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set  -> remote Turso database (data survives
  restarts / redeploys of the free host).
* otherwise                                  -> the local nutrisync.db file, exactly like before.

The Turso driver (`libsql`) is *almost* sqlite3-compatible but has no row_factory and
no named (:name) parameters. The small wrapper below adds both, so the rest of the
code base keeps using sqlite3-style calls unchanged.
"""
import os
import re
import sqlite3
import threading
import time
from pathlib import Path

from dotenv import load_dotenv

DIR = Path(__file__).resolve().parent
ROOT = DIR.parent
load_dotenv(DIR / ".env")
load_dotenv(ROOT / ".env")

_DEFAULT_DB = (
    os.path.join(os.path.dirname(__file__), "..", "nutrisync.db")
    if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "nutrisync.db"))
    else os.path.join(os.path.dirname(__file__), "nutrisync.db")
)
DEFAULT_DB_PATH = os.getenv("NUTRISYNC_DB_PATH", _DEFAULT_DB)


def _env(name: str) -> str:
    value = (os.getenv(name) or "").strip().strip('"').strip("'").strip()
    return "" if value.lower().startswith("your_") else value


def turso_enabled() -> bool:
    return bool(_env("TURSO_DATABASE_URL") and _env("TURSO_AUTH_TOKEN"))


def database_mode() -> str:
    return "turso" if turso_enabled() else "local"


def _import_libsql():
    try:
        import libsql
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "TURSO_DATABASE_URL is set but the 'libsql' package is not installed. "
            "Run: pip install libsql  (Linux x86_64 or Windows/macOS with Python 3.12/3.13)."
        ) from exc
    return libsql


# ---------------------------------------------------------------------------
# sqlite3-style helpers on top of libsql
# ---------------------------------------------------------------------------
class Row(tuple):
    """Tuple that can also be indexed by column name and passed to dict(), like sqlite3.Row."""

    def __new__(cls, values, columns):
        obj = super().__new__(cls, values)
        obj._columns = tuple(columns)
        return obj

    def keys(self):
        return list(self._columns)

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                return tuple.__getitem__(self, self._columns.index(key))
            except ValueError:
                lowered = [c.lower() for c in self._columns]
                if key.lower() in lowered:
                    return tuple.__getitem__(self, lowered.index(key.lower()))
                raise IndexError(f"No item with that key: {key}") from None
        return tuple.__getitem__(self, key)


_TOKEN = re.compile(r"'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|:([A-Za-z_]\w*)")


def _bind(sql, params):
    """libsql only takes positional (?) parameters; convert {:name: value} style."""
    if params is None:
        return sql, ()
    if isinstance(params, dict):
        ordered = []

        def swap(match):
            if match.group(1) is None:  # a quoted string literal -- leave it alone
                return match.group(0)
            ordered.append(params[match.group(1)])
            return "?"

        return _TOKEN.sub(swap, sql), tuple(ordered)
    return sql, tuple(params)


def split_statements(script: str) -> list:
    """Split an SQL script on ';' (ignoring quotes and -- comments)."""
    statements, buf, quote, i = [], [], None, 0
    while i < len(script):
        ch = script[i]
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
            buf.append(ch)
        elif ch == "-" and script[i:i + 2] == "--":
            end = script.find("\n", i)
            i = len(script) if end == -1 else end
            continue
        elif ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements



def _is_retryable_statement(sql: str) -> bool:
    s = (sql or "").strip()
    if not s:
        return False
    upper = s.upper()
    first = upper.split()[0]
    if first in ("SELECT", "PRAGMA", "EXPLAIN", "CREATE", "DROP", "ALTER"):
        return True
    if upper.startswith("INSERT OR REPLACE") or upper.startswith("INSERT OR IGNORE") or "ON CONFLICT" in upper:
        return True
    return False


def _is_retryable_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in (
        "idle for too long", "sqlite_busy", "database is locked",
        "stream closed", "stream error", "busy", "connection closed",
        "http error", "connection reset", "broken pipe", "failed to connect"
    ))


class _Cursor:
    def __init__(self, conn, raw):
        self._conn, self._raw = conn, raw

    def _wrap(self, row):
        if row is None or not self._conn.row_factory:
            return row
        return Row(row, [d[0] for d in (self._raw.description or [])])

    @property
    def lastrowid(self):
        return getattr(self._raw, "lastrowid", None)

    @property
    def rowcount(self):
        return getattr(self._raw, "rowcount", -1)

    @property
    def description(self):
        return getattr(self._raw, "description", None)

    def execute(self, sql, params=None):
        bound_sql, bound_params = _bind(sql, params)
        try:
            self._raw.execute(bound_sql, bound_params)
        except Exception as exc:
            if _is_retryable_error(exc) and _is_retryable_statement(sql):
                time.sleep(0.3)
                self._conn.reopen_if_needed()
                self._raw = self._conn._raw.cursor() if hasattr(self._conn._raw, "cursor") else self._conn._raw
                self._raw.execute(bound_sql, bound_params)
            else:
                raise
        return self

    def executemany(self, sql, seq):
        bound_seq = [tuple(p) for p in seq]
        try:
            self._raw.executemany(sql, bound_seq)
        except Exception as exc:
            if _is_retryable_error(exc) and _is_retryable_statement(sql):
                time.sleep(0.3)
                self._conn.reopen_if_needed()
                self._raw = self._conn._raw.cursor() if hasattr(self._conn._raw, "cursor") else self._conn._raw
                self._raw.executemany(sql, bound_seq)
            else:
                raise
        return self

    def fetchone(self):
        return self._wrap(self._raw.fetchone())

    def fetchall(self):
        return [self._wrap(r) for r in self._raw.fetchall()]

    def fetchmany(self, size=None):
        rows = self._raw.fetchmany(size) if size else self._raw.fetchmany()
        return [self._wrap(r) for r in rows]

    def __iter__(self):
        return iter(self.fetchall())


class LibsqlConnection:
    """sqlite3.Connection look-alike around a libsql connection."""

    def __init__(self, raw, opener=None, pool_key=None):
        self._raw = raw
        self._opener = opener
        self._pool_key = pool_key  # set when this connection came from the per-thread pool
        self.row_factory = None

    def reopen_if_needed(self):
        if self._opener:
            try:
                self._raw.close()
            except Exception:
                pass
            try:
                self._raw = self._opener()
            except Exception:
                pass

    def cursor(self):
        cur_raw = self._raw.cursor() if hasattr(self._raw, "cursor") else self._raw
        return _Cursor(self, cur_raw)

    def execute(self, sql, params=None):
        return self.cursor().execute(sql, params)

    def executemany(self, sql, seq):
        return self.cursor().executemany(sql, seq)

    def executescript(self, script):
        for stmt in split_statements(script):
            self.execute(stmt)
        self.commit()

    def commit(self):
        try:
            self._raw.commit()
        except Exception:
            pass

    def rollback(self):
        try:
            self._raw.rollback()
        except Exception:
            pass

    def close(self):
        self.rollback()
        if self._pool_key is not None:
            _release(self._pool_key, self._raw)  # keep it open for the next query on this thread
            return
        try:
            self._raw.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()
        return False


# ---------------------------------------------------------------------------
# Per-thread connection reuse (remote Turso only)
#
# Opening a Turso connection costs a network round trip, and one chat message used to open
# 20+ of them back to back. Each worker thread now keeps ONE open connection and reuses it for
# the next query. Safety rules:
#   * a connection idle for longer than NUTRISYNC_DB_POOL_IDLE seconds (default 3) is closed and
#     reopened, because Turso expires idle streams after a few seconds;
#   * if the thread's connection is already checked out (a function that holds a connection
#     calls another that wants one), the second caller gets its own fresh connection, so one
#     caller's rollback can never undo another caller's pending write;
#   * NUTRISYNC_DB_POOL=0 switches the whole thing off.
# ---------------------------------------------------------------------------
_tls = threading.local()


def pool_enabled() -> bool:
    return os.getenv("NUTRISYNC_DB_POOL", "1").strip() != "0"


def _pool_idle_secs() -> float:
    try:
        return float(os.getenv("NUTRISYNC_DB_POOL_IDLE", "3"))
    except ValueError:
        return 3.0


def _slots() -> dict:
    slots = getattr(_tls, "slots", None)
    if slots is None:
        slots = _tls.slots = {}
    return slots


def _checkout(key, opener):
    """Returns (raw_connection, pooled?). pooled? is False when a fresh one-off connection was made."""
    slot = _slots().get(key)
    if slot is not None and slot["busy"]:
        return opener(), False
    now = time.monotonic()
    if slot is not None and now - slot["used"] <= _pool_idle_secs():
        slot["busy"] = True
        return slot["raw"], True
    if slot is not None:
        try:
            slot["raw"].close()
        except Exception:
            pass
    raw = opener()
    _slots()[key] = {"raw": raw, "used": now, "busy": True}
    return raw, True


def _release(key, raw):
    slot = _slots().get(key)
    if slot is not None:
        slot["raw"] = raw  # reopen_if_needed() may have swapped it
        slot["used"] = time.monotonic()
        slot["busy"] = False


def _open_libsql(key, opener):
    if not pool_enabled():
        return LibsqlConnection(opener(), opener=opener)
    raw, pooled = _checkout(key, opener)
    return LibsqlConnection(raw, opener=opener, pool_key=key if pooled else None)


def get_db_connection(path=None):
    """Open the database. `path` is only used for the local SQLite fallback."""
    target_path = path or os.getenv("NUTRISYNC_DB_PATH") or DEFAULT_DB_PATH
    if os.getenv("NUTRISYNC_FORCE_LIBSQL") == "1":  # test hook: exercise the wrapper on a local file
        opener = lambda: _import_libsql().connect(target_path)
        return _open_libsql(("file", target_path, id(_import_libsql())), opener)
    if turso_enabled():
        url = _env("TURSO_DATABASE_URL")
        opener = lambda: _import_libsql().connect(url, auth_token=_env("TURSO_AUTH_TOKEN"))
        return _open_libsql(("turso", url, id(_import_libsql())), opener)
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    return conn
