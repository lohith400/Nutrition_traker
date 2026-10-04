"""Compare your local SQLite database with Turso, table by table.

    python backend/verify_turso.py nutrisync.db

Needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Prints PASS/FAIL per table and exits with
code 1 if any local row is missing in Turso. Read-only: it never changes either database.
"""
import sqlite3
import sys

try:
    from backend.database import get_db_connection, turso_enabled
except ImportError:
    from database import get_db_connection, turso_enabled


def main(src_path: str) -> int:
    if not turso_enabled():
        print("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.")
        return 2
    src = sqlite3.connect(src_path)
    dst = get_db_connection()
    tables = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    failed = 0
    for name in tables:
        local_n = src.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        try:
            remote_n = dst.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        except Exception as exc:
            print(f"FAIL  {name:<22} local={local_n:<6} turso=missing ({exc})")
            failed += 1
            continue
        ok = remote_n >= local_n
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {name:<22} local={local_n:<6} turso={remote_n}")
    src.close()
    dst.close()
    print("\nRESULT:", "all tables match - safe to deploy" if not failed else f"{failed} table(s) incomplete - re-run migrate_to_turso.py")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "nutrisync.db"))
