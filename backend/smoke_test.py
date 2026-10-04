"""Read-only smoke test for a running NutriSync backend (local or deployed).

    python backend/smoke_test.py http://127.0.0.1:8000
    python backend/smoke_test.py https://your-api.onrender.com --key YOUR_ACCESS_KEY

Checks: /health, that the API is protected when an access key is set, and that profile,
overview and chat history can be read. It never writes or deletes anything.
The first request to a sleeping Render service can take 30-60 seconds.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request


def call(base, path, key=None, timeout=90):
    req = urllib.request.Request(base.rstrip("/") + path)
    if key:
        req.add_header("X-Access-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as exc:
        return exc.code, None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base_url")
    ap.add_argument("--key", default="")
    args = ap.parse_args()
    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'}  {name} {detail}")

    status, body = call(args.base_url, "/health")
    check("health", status == 200 and (body or {}).get("status") == "ok", f"(HTTP {status})")
    if args.key:
        status, _ = call(args.base_url, "/api/profile")
        check("API rejects requests without the key", status == 401, f"(HTTP {status})")
    status, body = call(args.base_url, "/api/profile", args.key)
    check("read profile", status == 200, f"(HTTP {status}, {'onboarded' if body and body.get('status') != 'not_onboarded' else 'not onboarded yet'})")
    status, _ = call(args.base_url, "/api/overview", args.key)
    check("read overview", status == 200, f"(HTTP {status})")
    status, body = call(args.base_url, "/api/chat/days", args.key)
    check("read chat days", status == 200, f"(HTTP {status}, {len((body or {}).get('days', []))} day(s))")
    status, body = call(args.base_url, "/api/chat/history", args.key)
    check("read chat history", status == 200, f"(HTTP {status}, {len((body or {}).get('messages', []))} message(s) today)")
    print("\nRESULT:", "ALL PASSED" if all(results) else "SOME CHECKS FAILED")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
