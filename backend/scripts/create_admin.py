"""Create the one admin account, or change its password. Run from backend/:

    python -m scripts.create_admin                    # create the admin (refuses if one exists)
    python -m scripts.create_admin --reset-password   # set a new password for the existing admin
    python -m scripts.create_admin --show             # only print who the admin is

The database allows exactly one admin (index uq_users_single_admin from sql/admin.sql),
so on the shared Azure database only the first person to run this creates it; everyone
else signs in with that account.

Asks for the email, name and password. For a non-interactive run, set ADMIN_EMAIL,
ADMIN_NAME and ADMIN_PASSWORD instead. The password is never printed or stored in plain text.
"""

import argparse
import getpass
import os
import sys

import psycopg
from fastapi import HTTPException

from app.auth import check_new_password, hash_password
from app.audit import record
from app.db import is_valid_email


def find_admin(connection: psycopg.Connection):
    return connection.execute(
        "SELECT user_id, email, full_name, is_active FROM users WHERE role = 'admin'"
    ).fetchone()


def ask(prompt: str, env: str, default: str | None = None) -> str:
    value = os.environ.get(env)
    if value:
        return value.strip()
    suffix = f" [{default}]" if default else ""
    answer = input(f"{prompt}{suffix}: ").strip()
    return answer or (default or "")


def ask_password() -> str:
    password = os.environ.get("ADMIN_PASSWORD")
    if password is None:
        password = getpass.getpass("Password (8+ characters, a capital letter and a symbol): ")
        if password != getpass.getpass("Repeat the password: "):
            sys.exit("[admin] The passwords do not match. Nothing was changed.")
    try:
        check_new_password(password)
    except HTTPException as error:
        sys.exit(f"[admin] {error.detail} Nothing was changed.")
    return password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create the single admin account or reset its password.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--reset-password", action="store_true", help="set a new password for the existing admin")
    group.add_argument("--show", action="store_true", help="only show which account is the admin")
    args = parser.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("[admin] DATABASE_URL is not set. Set it in this terminal first (see README).")

    with psycopg.connect(url) as connection:
        has_column = connection.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'full_name'"
        ).fetchone()
        if not has_column:
            sys.exit("[admin] The database is missing the admin migration. Run: python -m scripts.migrate")

        admin = find_admin(connection)

        if args.show:
            if admin is None:
                print("[admin] There is no admin account yet. Create it with: python -m scripts.create_admin")
            else:
                state = "active" if admin[3] else "DEACTIVATED"
                print(f"[admin] The admin account is {admin[1]} ({admin[2] or 'no name'}, {state}).")
            return 0

        if args.reset_password:
            if admin is None:
                sys.exit("[admin] There is no admin account yet. Run without --reset-password to create it.")
            print(f"[admin] Setting a new password for {admin[1]}.")
            password = ask_password()
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET password_hash = %s, is_active = TRUE WHERE user_id = %s",
                    (hash_password(password), admin[0]),
                )
                # Old sign-ins stop working with the old password.
                cursor.execute("DELETE FROM user_sessions WHERE user_id = %s", (admin[0],))
                record(cursor, "admin.password_reset", actor_email=admin[1], actor_role="admin",
                       target_type="user", target_id=admin[0], details={"via": "create_admin script"})
            print("[admin] Password changed. Sign in again on the website.")
            return 0

        # Create: check first, change nothing if an admin is already there.
        if admin is not None:
            print(f"[admin] An admin account already exists: {admin[1]}. Nothing was changed.")
            print("[admin] There can be only one. Sign in with it, or use --reset-password if the password is lost.")
            return 1

        email = ask("Admin email", "ADMIN_EMAIL").lower()
        if not is_valid_email(email):
            sys.exit("[admin] Please enter a valid email. Nothing was changed.")
        taken = connection.execute("SELECT role FROM users WHERE LOWER(email) = %s", (email,)).fetchone()
        if taken:
            sys.exit(f"[admin] {email} is already used by a {taken[0]} account. Use another email. Nothing was changed.")
        full_name = " ".join(ask("Admin name", "ADMIN_NAME", "Administrator").split())
        password = ask_password()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (email, password_hash, role, full_name, email_verified, email_verified_at)
                    VALUES (%s, %s, 'admin', %s, TRUE, CURRENT_TIMESTAMP)
                    RETURNING user_id
                    """,
                    (email, hash_password(password), full_name),
                )
                user_id = cursor.fetchone()[0]
                record(cursor, "admin.created", actor_user_id=user_id, actor_email=email, actor_role="admin",
                       target_type="user", target_id=user_id, details={"via": "create_admin script"})
        except psycopg.errors.UniqueViolation:
            # Someone else created the admin at the same moment.
            sys.exit("[admin] An admin account was created by someone else just now. Nothing was changed.")

    print(f"[admin] Admin account created: {email}. Sign in on the website with this email and password.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
