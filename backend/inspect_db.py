import sqlite3

conn = sqlite3.connect("ai_biz.db")
cur = conn.cursor()

print("=== Tables ===")
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cur.fetchall()]
for t in tables:
    print(t)

candidates = [t for t in tables if "dataset" in t.lower()]
print("\n=== Candidate dataset tables ===")
print(candidates)

for t in candidates:
    print(f"\n=== Columns in {t} ===")
    cur.execute(f"PRAGMA table_info({t})")
    cols = cur.fetchall()
    for c in cols:
        print(c)

    col_names = [c[1] for c in cols]
    select_cols = [c for c in ("id", "filename", "status", "kpis", "organization_id") if c in col_names]
    print(f"\n=== Rows in {t} (columns: {select_cols}) ===")
    cur.execute(f"SELECT {', '.join(select_cols)} FROM {t}")
    for row in cur.fetchall():
        print(row)

conn.close()
