"""Prepare the database. Run from backend/: python -m scripts.migrate

- Empty database: creates the tables and sample data from task09_reference.sql
  (sections 1-7 only; the server-wide roles and the demo transaction are skipped,
  because hosted databases such as Neon may not allow creating roles).
- Every run: applies the other schema files. Each is safe to run more than once.

It never runs task09_reference.sql on a database that already has tables,
because that script drops them.
"""

import os
import sys
from pathlib import Path

import psycopg


SQL = Path(__file__).resolve().parents[1] / "sql"

# Same order as the README setup. Each file is safe to run again.
MIGRATIONS = [
    "auth_schema",
    "booking_hold",
    "email_verification",
    "booking_cancellation",
    "trainer_availability",
    "password_reset",
    "trainer_booking_overlap",
]

ROLES_SECTION = "-- 8. ACCESS CONTROL"


def base_schema() -> str:
    script = (SQL / "task09_reference.sql").read_text(encoding="utf-8")
    cut = script.find(ROLES_SECTION)
    if cut < 0:
        raise RuntimeError(f"task09_reference.sql no longer has a {ROLES_SECTION!r} section; update scripts/migrate.py.")
    return script[:cut]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("[migrate] DATABASE_URL is not set; skipping database setup.", flush=True)
        return 0

    with psycopg.connect(url, autocommit=True) as connection:
        empty = connection.execute("SELECT to_regclass('public.members') IS NULL").fetchone()[0]
        if empty:
            print("[migrate] Empty database: creating tables and sample data.", flush=True)
            with connection.transaction():
                connection.execute(base_schema())

        for name in MIGRATIONS:
            with connection.transaction():
                connection.execute((SQL / f"{name}.sql").read_text(encoding="utf-8"))
            print(f"[migrate] Applied {name}.sql", flush=True)

    print("[migrate] Database is ready.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
