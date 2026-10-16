"""Small durable SQLite document store; user data never lives in tracked source files."""
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
import json
import os
import sqlite3

LOCK = RLock()


class Store:
    def __init__(self, path=None):
        self.path = Path(path or os.environ.get("WORKFLOW_DB", Path(__file__).parent / "data" / "workflow.sqlite"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS documents (
                    collection TEXT NOT NULL, id TEXT NOT NULL,
                    body TEXT NOT NULL, PRIMARY KEY(collection, id)
                );
            """)

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=15)
        try:
            with con:
                yield con
        finally:
            con.close()

    def get(self, collection, ident):
        with LOCK, self.connect() as con:
            row = con.execute("SELECT body FROM documents WHERE collection=? AND id=?", (collection, ident)).fetchone()
        if not row:
            raise KeyError("Record not found")
        return json.loads(row[0])

    def list(self, collection):
        with LOCK, self.connect() as con:
            rows = con.execute("SELECT body FROM documents WHERE collection=?", (collection,)).fetchall()
        return sorted((json.loads(r[0]) for r in rows), key=lambda r: r.get("createdAt", ""), reverse=True)

    def put(self, collection, value):
        with LOCK, self.connect() as con:
            con.execute("INSERT OR REPLACE INTO documents VALUES (?,?,?)",
                        (collection, value["id"], json.dumps(value, ensure_ascii=False)))
        return value

    def update(self, collection, ident, fn):
        with LOCK:
            value = self.get(collection, ident)
            fn(value)
            self.put(collection, value)
            return value

    def delete(self, collection, ident):
        with LOCK, self.connect() as con:
            cur = con.execute("DELETE FROM documents WHERE collection=? AND id=?", (collection, ident))
            if not cur.rowcount:
                raise KeyError("Record not found")
