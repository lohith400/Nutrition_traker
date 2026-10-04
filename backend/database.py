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


import time


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
    return any(k in msg for k in ("idle for too long", "sqlite_busy", "database is locked", "stream closed", "stream error", "busy"))


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

    def __init__(self, raw, opener=None):
        self._raw = raw
        self._opener = opener
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


def get_db_connection(path=None):
    """Open the database. `path` is only used for the local SQLite fallback."""
    if os.getenv("NUTRISYNC_FORCE_LIBSQL") == "1":  # test hook: exercise the wrapper on a local file
        opener = lambda: _import_libsql().connect(path or DEFAULT_DB_PATH)
        return LibsqlConnection(opener(), opener=opener)
    if turso_enabled():
        opener = lambda: _import_libsql().connect(_env("TURSO_DATABASE_URL"), auth_token=_env("TURSO_AUTH_TOKEN"))
        return LibsqlConnection(opener(), opener=opener)
    return sqlite3.connect(path or DEFAULT_DB_PATH)

