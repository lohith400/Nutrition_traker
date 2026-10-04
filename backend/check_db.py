"""Quick self-test for the database connection. Run it once after setting the Turso variables:

    python backend/check_db.py

It writes and deletes one throw-away table, so it never touches your real data.
"""
try:
    from backend.database import database_mode, get_db_connection
except ImportError:
    from database import database_mode, get_db_connection


def main() -> None:
    print(f"Database mode: {database_mode()}")
    conn = get_db_connection()
    conn.execute("CREATE TABLE IF NOT EXISTS _selftest (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, qty REAL)")
    cur = conn.execute("INSERT INTO _selftest (name, qty) VALUES (:n, :q)", {"n": "idli", "q": 2.5})
    conn.commit()
    assert cur.lastrowid, "lastrowid missing"
    conn.row_factory = True
    row = conn.execute("SELECT * FROM _selftest WHERE id = ?", (cur.lastrowid,)).fetchone()
    assert row["name"] == "idli" and dict(row)["qty"] == 2.5, "row access by name failed"
    upd = conn.execute("UPDATE _selftest SET qty = 3 WHERE id = ?", (cur.lastrowid,))
    conn.commit()
    print(f"  insert ok (id {cur.lastrowid}), update rowcount = {upd.rowcount}")
    conn.execute("DROP TABLE _selftest")
    conn.commit()
    try:
        foods = conn.execute("SELECT COUNT(*) FROM food_items").fetchone()[0]
        print(f"  food_items: {foods} rows")
    except Exception:
        print("  food_items table not created yet (run: python backend/db_setup.py --if-needed)")
    conn.close()
    print("All good.")


if __name__ == "__main__":
    main()
