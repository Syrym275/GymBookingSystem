"""Forgotten passwords: emailed one-time links and the endpoint that sets a new password.

A link looks like {APP_URL}/reset-password?token=...  The frontend page reads the token
and POSTs it with the new password to /auth/reset-password. Only the SHA-256 hash of a
token is stored, a link works once, and it expires after an hour.
"""

import html
import logging
import secrets
from urllib.parse import urlencode

import psycopg
from fastapi import APIRouter, BackgroundTasks, HTTPException

from .auth import check_new_password, hash_password
from .db import connect
from .mailer import OutgoingEmail, send_email
from .models import ForgotPasswordRequest, ResetPasswordRequest
from .verification import app_url, token_hash


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)

TOKEN_MINUTES = 60
REQUESTS_PER_HOUR = 3

FORGOT_ANSWER = "If an account uses that email, we have sent a link to reset the password. Check your inbox."
INVALID_LINK = "This password reset link is invalid or has expired. Request a new one."


def issue_reset_token(cursor, user_id: int) -> str:
    """Store a new token and return it. Earlier unused links stop working."""
    cursor.execute(
        """
        UPDATE password_reset_tokens
        SET expires_at = CURRENT_TIMESTAMP
        WHERE user_id = %s
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        """,
        (user_id,),
    )
    token = secrets.token_urlsafe(32)
    cursor.execute(
        """
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP + make_interval(mins => %s))
        """,
        (user_id, token_hash(token), TOKEN_MINUTES),
    )
    return token


def reset_link(token: str) -> str:
    return f"{app_url()}/reset-password?{urlencode({'token': token})}"


def send_reset_email(email: str, token: str) -> None:
    link = reset_link(token)
    text = (
        "Someone asked to reset the password of your PulseGym account.\n\n"
        "Choose a new password by opening this link:\n"
        f"{link}\n\n"
        f"The link works once and expires in {TOKEN_MINUTES} minutes.\n"
        "If you did not ask for this, ignore this email. Your password stays the same.\n"
    )
    safe_link = html.escape(link, quote=True)
    body = (
        "<p>Someone asked to reset the password of your PulseGym account.</p>"
        f'<p><a href="{safe_link}" style="display:inline-block;padding:12px 20px;background:#111;'
        'color:#fff;text-decoration:none;border-radius:8px">Choose a new password</a></p>'
        f'<p>Or copy this link into your browser:<br><a href="{safe_link}">{safe_link}</a></p>'
        f"<p>The link works once and expires in {TOKEN_MINUTES} minutes. "
        "If you did not ask for this, ignore this email. Your password stays the same.</p>"
    )
    try:
        send_email(OutgoingEmail(to=email, subject="Reset your PulseGym password", text=text, html=body))
    except Exception:
        logger.exception("Could not send the password reset email to %s", email)


def database_unavailable(action: str) -> HTTPException:
    logger.exception("%s database query failed", action)
    return HTTPException(status_code=503, detail=f"{action} is temporarily unavailable. Check the backend log.")


@router.post("/forgot-password", status_code=202)
def forgot_password(input: ForgotPasswordRequest, background: BackgroundTasks) -> dict[str, str]:
    """Same answer, in about the same time, whether or not the account exists.

    The email is sent after the response so its delay does not reveal which emails have accounts.
    """
    email = input.email.strip().lower()
    token = None

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id
                    FROM users
                    WHERE LOWER(BTRIM(email)) = %s
                      AND is_active = TRUE
                    FOR UPDATE
                    """,
                    (email,),
                )
                row = cursor.fetchone()

                if row is not None:
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM password_reset_tokens
                        WHERE user_id = %s
                          AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
                        """,
                        (row[0],),
                    )
                    if cursor.fetchone()[0] >= REQUESTS_PER_HOUR:
                        logger.info("Password reset limit reached for user %s", row[0])
                    else:
                        token = issue_reset_token(cursor, row[0])
    except psycopg.Error:
        raise database_unavailable("Password reset") from None

    if token is not None:
        background.add_task(send_reset_email, email, token)

    return {"detail": FORGOT_ANSWER}


@router.post("/reset-password")
def reset_password(input: ResetPasswordRequest) -> dict[str, str]:
    token = input.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail=INVALID_LINK)

    check_new_password(input.password)
    password_hash = hash_password(input.password)

    try:
        with connect() as connection:  # one transaction: commits on success, rolls back on error
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT t.token_id, t.user_id
                    FROM password_reset_tokens t
                    JOIN users u ON u.user_id = t.user_id
                    WHERE t.token_hash = %s
                      AND t.used_at IS NULL
                      AND t.expires_at > CURRENT_TIMESTAMP
                      AND u.is_active = TRUE
                    FOR UPDATE OF t, u
                    """,
                    (token_hash(token),),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=400, detail=INVALID_LINK)

                token_id, user_id = row
                # Opening the emailed link also proves the user owns the address.
                cursor.execute(
                    """
                    UPDATE users
                    SET password_hash = %s,
                        email_verified = TRUE,
                        email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
                    WHERE user_id = %s
                    """,
                    (password_hash, user_id),
                )
                # Every link for this user stops working, including the one just used.
                cursor.execute(
                    """
                    UPDATE password_reset_tokens
                    SET used_at = CASE WHEN token_id = %s THEN CURRENT_TIMESTAMP ELSE used_at END,
                        expires_at = LEAST(expires_at, CURRENT_TIMESTAMP)
                    WHERE user_id = %s
                      AND used_at IS NULL
                    """,
                    (token_id, user_id),
                )
                # Sign out everywhere: whoever knew the old password loses access.
                cursor.execute("DELETE FROM user_sessions WHERE user_id = %s", (user_id,))
                # A new password lifts any sign-in lockout on this account.
                cursor.execute(
                    "DELETE FROM login_lockouts WHERE email = (SELECT LOWER(BTRIM(email)) FROM users WHERE user_id = %s)",
                    (user_id,),
                )
    except psycopg.Error:
        raise database_unavailable("Password reset") from None

    return {"detail": "Your password has been changed. Log in with your new password."}
