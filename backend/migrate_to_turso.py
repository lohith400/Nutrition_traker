"""One-time copy of your existing local SQLite database into Turso.

    # Windows PowerShell (from the project folder):
    $env:TURSO_DATABASE_URL="libsql://your-db-yourname.turso.io"
    $env:TURSO_AUTH_TOKEN="your-token"
    python backend/migrate_to_turso.py nutrisync.db

Copies every table (meals, profile, water, reminders, grocery, chat history, ...) with the
same ids. Safe to run again: rows are replaced, nothing is deleted from Turso.
"""
import sqlite3
import sys

try:
    from backend.database import get_db_connection, turso_enabled
except ImportError:
    from database import get_db_connection, turso_enabled


def main(src_path: str) -> None:
    if not turso_enabled():
        sys.exit("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first (see docs/FREE_DEPLOYMENT.md).")
    src = sqlite3.connect(src_path)
    dst = get_db_connection()

    tables = [r for r in src.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL")]
    for name, ddl in tables:
        dst.execute(ddl.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1) if "IF NOT EXISTS" not in ddl else ddl)
    for (ddl,) in src.execute("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"):
        try:
            dst.execute(ddl.replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)
                        .replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1))
        except Exception as exc:  # an index that already exists is fine
            print(f"  (index skipped: {exc})")
    dst.commit()

    for name, _ in tables:
        cols = [c[1] for c in src.execute(f"PRAGMA table_info({name})")]
        rows = src.execute(f"SELECT {', '.join(cols)} FROM {name}").fetchall()
        if name == "food_items":
            try:
                dst_count = dst.execute("SELECT COUNT(*) FROM food_items").fetchone()[0]
                if dst_count == len(rows):
                    print(f"  {name}: {dst_count} rows already up to date, skipping")
                    continue
            except Exception:
                pass
        if rows:
            marks = ", ".join("?" for _ in cols)
            for i in range(0, len(rows), 200):
                dst.executemany(f"INSERT OR REPLACE INTO {name} ({', '.join(cols)}) VALUES ({marks})", rows[i:i + 200])
            dst.commit()
        print(f"  {name}: {len(rows)} rows copied")
    dst.close()
    src.close()
    print("Done. Your data is now in Turso.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "nutrisync.db")
