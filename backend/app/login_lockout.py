"""Sign-in lockout: after MAX_FAILED_LOGINS wrong passwords for one email, block it for a while.

State lives in the login_lockouts table (sql/login_lockout.sql), so it holds across restarts
and across several server processes. All times use the database clock.

Every attempt is counted *before* the password is checked (begin_attempt), in one atomic
statement, and the count is removed again on success (clear). Counting afterwards would let
many parallel requests all pass the "is it locked?" check while their passwords are still
being checked, giving far more than MAX_FAILED_LOGINS guesses.
"""

import math

import psycopg


MAX_FAILED_LOGINS = 5
FAILURE_WINDOW_MINUTES = 15  # failures older than this no longer count
LOCKOUT_MINUTES = 15


class Attempt:
    """Result of begin_attempt: either locked (seconds left) or allowed as attempt number `number`."""

    def __init__(self, number: int, locked_seconds: int | None):
        self.number = number
        self.locked_seconds = locked_seconds


def begin_attempt(cursor: psycopg.Cursor, email: str) -> Attempt:
    """Counts one attempt for this email, or reports the lock that is already in place.

    The caller must commit before checking the password, so parallel attempts see each other.
    """
    cursor.execute(
        """
        INSERT INTO login_lockouts (email, failed_count, window_started_at)
        VALUES (%(email)s, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE SET
            failed_count = CASE
                WHEN login_lockouts.locked_until > CURRENT_TIMESTAMP THEN login_lockouts.failed_count
                WHEN login_lockouts.window_started_at < CURRENT_TIMESTAMP - make_interval(mins => %(window)s) THEN 1
                ELSE login_lockouts.failed_count + 1 END,
            window_started_at = CASE
                WHEN login_lockouts.locked_until > CURRENT_TIMESTAMP THEN login_lockouts.window_started_at
                WHEN login_lockouts.window_started_at < CURRENT_TIMESTAMP - make_interval(mins => %(window)s) THEN CURRENT_TIMESTAMP
                ELSE login_lockouts.window_started_at END
        RETURNING
            failed_count,
            CASE WHEN locked_until > CURRENT_TIMESTAMP
                 THEN EXTRACT(EPOCH FROM locked_until - CURRENT_TIMESTAMP) END
        """,
        {"email": email, "window": FAILURE_WINDOW_MINUTES},
    )
    number, seconds = cursor.fetchone()
    if seconds is not None:
        return Attempt(number, max(1, math.ceil(seconds)))
    if number > MAX_FAILED_LOGINS:
        # Earlier attempts in this window are still being checked; this one is over the limit.
        return Attempt(number, lock(cursor, email))
    return Attempt(number, None)


def register_failure(cursor: psycopg.Cursor, email: str, attempt: Attempt) -> int | None:
    """Called after a wrong password (already counted). Returns the lock length if this failure locks the email."""
    if attempt.number < MAX_FAILED_LOGINS:
        return None
    return lock(cursor, email)


def lock(cursor: psycopg.Cursor, email: str) -> int:
    """Locks the email and starts counting afresh once the lock ends. Returns the lock length in seconds."""
    cursor.execute(
        """
        UPDATE login_lockouts
        SET locked_until = CURRENT_TIMESTAMP + make_interval(mins => %s),
            failed_count = 0,
            window_started_at = CURRENT_TIMESTAMP
        WHERE email = %s
        """,
        (LOCKOUT_MINUTES, email),
    )
    return LOCKOUT_MINUTES * 60


def clear(cursor: psycopg.Cursor, email: str) -> None:
    cursor.execute("DELETE FROM login_lockouts WHERE email = %s", (email,))


def lockout_detail(seconds: int) -> str:
    minutes = max(1, math.ceil(seconds / 60))
    unit = "minute" if minutes == 1 else "minutes"
    return f"Too many failed sign-in attempts. Try again in {minutes} {unit}."
