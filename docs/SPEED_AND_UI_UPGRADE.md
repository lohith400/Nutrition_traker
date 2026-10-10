# Speed + UI upgrade notes

## Speed (backend)
| What | Where | Why |
|---|---|---|
| Streaming replies | `POST /api/chat/stream` (NDJSON), `orchestrator.chat_with_tools_stream` | Text appears after ~1 s instead of after the whole reply. `/api/chat` still works as the fallback. |
| Connection reuse (Turso) | `database.py` | One open connection per worker thread instead of a new one per query. Idle > 3 s is reopened; a connection already in use is never shared. |
| Parallel reads | `perf.parallel`, `orchestrator._context`, `app._chat_prepare/_chat_finish` | Independent queries run at the same time. |
| Short caches | `perf.cached` (profile, facts, patterns, food index) | Cleared automatically on every write. Only active on the remote database. |
| Pattern detection off the request path | `memory_agent.maybe_detect_patterns_background` | The 10-minute housekeeping no longer delays a reply. |
| Non-blocking startup | `app.lifespan` | Google Fit sync and food-index warm-up run in the background. |
| Cold-start fix | `.github/workflows/keep-alive.yml`, `components/WarmUp.tsx` | Pings `/health` every 10 min; the web app also wakes the server on load and explains the wait. |

### Settings (all optional)
| Variable | Default | Meaning |
|---|---|---|
| `NUTRISYNC_CACHE` | on for Turso, off for local SQLite | `1` / `0` forces caching on / off |
| `NUTRISYNC_CACHE_TTL` | `30` | seconds a cached value lives (writes clear it sooner) |
| `NUTRISYNC_DB_POOL` | `1` | `0` turns connection reuse off |
| `NUTRISYNC_DB_POOL_IDLE` | `3` | seconds before an idle pooled connection is replaced |

GitHub repo variable `BACKEND_URL` (Settings -> Secrets and variables -> Actions -> Variables) turns on the keep-alive workflow.

## UI
* Fixed: headings fell back to Times (`Playfair Display` was never loaded) -> now Fraunces, self-hosted via `@fontsource` (no Google Fonts needed at build time).
* Fixed: React hydration errors (clock-based greeting/date, inline `<style>` in chat).
* Fixed: on phones the chat input sat under the bottom tab bar.
* New: warm paper theme (`app/polish.css`), entrance motion, count-up numbers, loading skeletons, reduced-motion support.
* New: live coach replies with status line + caret, starter chips (`lib/chatStream.ts`).
* New: Quick add (Ctrl/Cmd+K, `/`, or the + button on phones) - `components/QuickAdd.tsx`.
* New: goal celebration (`components/GoalBurst.tsx`), server warm-up note (`components/WarmUp.tsx`).

## Tests
`python -m pytest tests -q` (74 tests). `tests/test_speed.py` covers streaming, the false-"logged" guard, caching, parallel runs and connection reuse.
