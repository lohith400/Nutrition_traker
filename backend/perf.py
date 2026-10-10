"""Small speed helpers: a TTL cache, a parallel runner and a background runner.

Why this exists
---------------
With the remote Turso database every query is a network round trip (tens to hundreds of ms).
A single coach message used to run 20+ of them one after another. Three cheap tricks fix that
without touching any business logic:

* ``cached``     - remember rarely-changing reads (profile, facts, patterns, food index) for a
                   few seconds, and forget them the moment something writes.
* ``parallel``   - run independent reads at the same time instead of one after another.
* ``background`` - do housekeeping (pattern detection) after the reply instead of before it.

Caching is ON when the remote database is used (production), OFF for the plain local SQLite
file (laptop / tests) where queries take microseconds and fresh reads are simpler. Force it with
``NUTRISYNC_CACHE=1`` or ``NUTRISYNC_CACHE=0``.
"""
from __future__ import annotations

import copy
import logging
import os
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable

try:
    from backend import database
except ImportError:  # run from inside backend/
    import database

log = logging.getLogger("nutrisync.perf")

DEFAULT_TTL = float(os.getenv("NUTRISYNC_CACHE_TTL", "30"))


def cache_enabled() -> bool:
    flag = (os.getenv("NUTRISYNC_CACHE") or "").strip()
    if flag in ("0", "1"):
        return flag == "1"
    return database.turso_enabled()


_lock = threading.Lock()
_store: dict[Any, tuple[float, Any]] = {}


def cached(key: Any, loader: Callable[[], Any], ttl: float | None = None) -> Any:
    """Return loader()'s value, reusing a copy for `ttl` seconds when caching is enabled."""
    if not cache_enabled():
        return loader()
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit is not None and hit[0] > now:
            return copy.deepcopy(hit[1])
    value = loader()
    with _lock:
        _store[key] = (now + (DEFAULT_TTL if ttl is None else ttl), copy.deepcopy(value))
    return value


def invalidate(*keys: Any, prefix: Any = None) -> None:
    """Forget cached values. `prefix` drops every tuple key whose first element equals it."""
    with _lock:
        for key in keys:
            _store.pop(key, None)
        if prefix is not None:
            for key in [k for k in _store if isinstance(k, tuple) and k and k[0] == prefix]:
                _store.pop(key, None)


def clear() -> None:
    with _lock:
        _store.clear()


# Worker threads are long-lived, so each keeps its own open database connection (see database.py).
_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ns-par")


def parallel(*calls: Callable[[], Any]) -> list:
    """Run the callables at the same time and return their results in order.
    If any raises, the first exception is re-raised after all have finished."""
    futures = [_executor.submit(c) for c in calls]
    results, first_error = [], None
    for f in futures:
        try:
            results.append(f.result())
        except Exception as exc:  # noqa: BLE001
            results.append(None)
            first_error = first_error or exc
    if first_error:
        raise first_error
    return results


def submit(call: Callable[[], Any]) -> Future:
    """Start a callable on the shared pool and return its Future (for 'start now, join later')."""
    return _executor.submit(call)


_bg = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ns-bg")


def background(call: Callable[[], Any], label: str = "task") -> None:
    """Fire-and-forget. Failures are logged, never raised into the request."""
    def run():
        try:
            call()
        except Exception as exc:  # noqa: BLE001
            log.warning("background %s failed: %s", label, exc)
    _bg.submit(run)
