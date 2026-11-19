"""Audit log: one row per important action (sign-ins, sign-ups, every admin change)."""

import logging

import psycopg
from psycopg.types.json import Jsonb

from .db import connect


logger = logging.getLogger(__name__)


def record(
    cursor: psycopg.Cursor,
    action: str,
    *,
    actor_user_id: int | None = None,
    actor_email: str | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    details: dict | None = None,
) -> None:
    """Write inside the caller's transaction, so the log and the change commit (or roll back) together."""
    cursor.execute(
        """
        INSERT INTO audit_log (actor_user_id, actor_email, actor_role, action, target_type, target_id, details)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (actor_user_id, actor_email, actor_role, action, target_type, target_id, Jsonb(details or {})),
    )


def record_separately(action: str, **fields) -> None:
    """For events with no transaction of their own (for example a failed sign-in). Never raises."""
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                record(cursor, action, **fields)
    except Exception:  # the audit log must never break the request it describes
        logger.exception("Could not write audit log entry %s", action)
