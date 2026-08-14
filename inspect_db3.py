import sqlite3

conn = sqlite3.connect("storage/ai_biz.db")
cur = conn.cursor()
cur.execute("SELECT id, filename, status, kpis, columns FROM datasets ORDER BY created_at DESC LIMIT 3")
for row in cur.fetchall():
    print(row)
conn.close()
