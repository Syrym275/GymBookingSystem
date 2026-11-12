"""Email verification: one-time links, the verify and resend endpoints, and a guard.

A link looks like {APP_URL}/verify-email?token=...  The frontend page reads the token
and POSTs it to /auth/verify-email. Only the SHA-256 hash of a token is stored.
"""

import hashlib
import html
import logging
import os
import secrets
from urllib.parse import urlencode

import psycopg
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from .db import connect
from .mailer import OutgoingEmail, send_email
from .models import BookingCreateRequest, ResendVerificationRequest, VerifyEmailRequest, VerifyEmailResponse


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)

TOKEN_HOURS = 24
RESENDS_PER_HOUR = 3

INVALID_LINK = "This verification link is invalid or has expired. Request a new one below."
RESEND_ANSWER = "If that account still needs verifying, we have sent a new link. Check your inbox."


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(cursor, user_id: int) -> str:
    """Store a new token for the user and return it. Earlier unused tokens stop working."""
    cursor.execute(
        """
        UPDATE email_verification_tokens
        SET expires_at = CURRENT_TIMESTAMP
        WHERE user_id = %s
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        """,
        (user_id,),
    )
    token = secrets.token_urlsafe(32)  # 32 random bytes
    cursor.execute(
        """
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP + make_interval(hours => %s))
        """,
        (user_id, token_hash(token), TOKEN_HOURS),
    )
    return token


def verification_link(token: str) -> str:
    app_url = os.environ.get("APP_URL", "http://localhost:5173").rstrip("/")
    return f"{app_url}/verify-email?{urlencode({'token': token})}"


def send_verification_email(email: str, token: str) -> bool:
    """Returns False instead of raising, so a mail problem never loses a saved account."""
    link = verification_link(token)
    text = (
        "Welcome to PulseGym!\n\n"
        "Confirm your email address by opening this link:\n"
        f"{link}\n\n"
        f"The link works once and expires in {TOKEN_HOURS} hours.\n"
        "If you did not create a PulseGym account, you can ignore this email.\n"
    )
    safe_link = html.escape(link, quote=True)
    body = (
        "<p>Welcome to PulseGym!</p>"
        "<p>Confirm your email address:</p>"
        f'<p><a href="{safe_link}" style="display:inline-block;padding:12px 20px;background:#111;'
        'color:#fff;text-decoration:none;border-radius:8px">Verify my email</a></p>'
        f'<p>Or copy this link into your browser:<br><a href="{safe_link}">{safe_link}</a></p>'
        f"<p>The link works once and expires in {TOKEN_HOURS} hours. "
        "If you did not create a PulseGym account, you can ignore this email.</p>"
    )
    try:
        send_email(OutgoingEmail(to=email, subject="Verify your PulseGym email", text=text, html=body))
        return True
    except Exception:
        logger.exception("Could not send the verification email to %s", email)
        return False


def database_unavailable(action: str) -> HTTPException:
    logger.exception("%s database query failed", action)
    return HTTPException(status_code=503, detail=f"{action} is temporarily unavailable. Check the backend log.")


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(input: VerifyEmailRequest) -> VerifyEmailResponse:
    token = input.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail=INVALID_LINK)

    try:
        with connect() as connection:  # one transaction: commits on success, rolls back on error
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        t.token_id,
                        t.user_id,
                        t.used_at IS NOT NULL AS used,
                        t.expires_at > CURRENT_TIMESTAMP AS still_valid,
                        u.email_verified,
                        u.email
                    FROM email_verification_tokens t
                    JOIN users u ON u.user_id = t.user_id
                    WHERE t.token_hash = %s
                    FOR UPDATE OF t, u
                    """,
                    (token_hash(token),),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=400, detail=INVALID_LINK)

                token_id, user_id, used, still_valid, already_verified, email = row

                # Clicking an old link after verifying is a success, not an error.
                if already_verified:
                    return VerifyEmailResponse(email=email, already_verified=True)

                if used or not still_valid:
                    raise HTTPException(status_code=400, detail=INVALID_LINK)

                cursor.execute(
                    """
                    UPDATE users
                    SET email_verified = TRUE,
                        email_verified_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                cursor.execute(
                    "UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_id = %s",
                    (token_id,),
                )
    except psycopg.Error:
        raise database_unavailable("Email verification") from None

    return VerifyEmailResponse(email=email, already_verified=False)


@router.post("/resend-verification", status_code=202)
def resend_verification(input: ResendVerificationRequest) -> dict[str, str]:
    """Same answer whether or not the account exists, is verified or hit the limit."""
    email = input.email.strip().lower()
    token = None

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, email_verified
                    FROM users
                    WHERE LOWER(BTRIM(email)) = %s
                      AND is_active = TRUE
                    FOR UPDATE
                    """,
                    (email,),
                )
                row = cursor.fetchone()

                if row is not None and not row[1]:
                    # The first token comes from sign-up; only later ones count as resends.
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM email_verification_tokens
                        WHERE user_id = %s
                          AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
                          AND token_id <> (
                              SELECT MIN(token_id) FROM email_verification_tokens WHERE user_id = %s
                          )
                        """,
                        (row[0], row[0]),
                    )
                    if cursor.fetchone()[0] >= RESENDS_PER_HOUR:
                        logger.info("Verification resend limit reached for user %s", row[0])
                    else:
                        token = issue_token(cursor, row[0])
    except psycopg.Error:
        raise database_unavailable("Email verification") from None

    if token is not None:
        send_verification_email(email, token)

    return {"detail": RESEND_ANSWER}


# ---- Guard -------------------------------------------------------------------------

EMAIL_NOT_VERIFIED = (
    "Please verify your email before booking or paying. "
    "Use the link we emailed you, or request a new one."
)


def ensure_email_verified(*, member_id: int | None = None, booking_id: int | None = None) -> None:
    """Raise 403 if the account behind this member or booking has not verified its email.

    Members without a login (created at the front desk) have no users row and are allowed.
    """
    if member_id is None and booking_id is None:
        return

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                if member_id is not None:
                    cursor.execute("SELECT email_verified FROM users WHERE member_id = %s", (member_id,))
                else:
                    cursor.execute(
                        """
                        SELECT u.email_verified
                        FROM bookings b
                        JOIN users u ON u.member_id = b.member_id
                        WHERE b.booking_id = %s
                        """,
                        (booking_id,),
                    )
                row = cursor.fetchone()
    except psycopg.Error:
        raise database_unavailable("Email verification check") from None

    if row is not None and not row[0]:
        raise HTTPException(status_code=403, detail=EMAIL_NOT_VERIFIED, headers={"X-Error-Code": "email_not_verified"})


async def require_verified_member(request: Request) -> None:
    """Dependency for routes whose JSON body has a member_id (e.g. POST /bookings)."""
    try:
        body = await request.json()  # Starlette caches the body, so the route still reads it
        booking = BookingCreateRequest.model_validate(body)
    except (ValueError, ValidationError):
        return  # invalid request: the route answers with 422 without touching the database
    await run_in_threadpool(ensure_email_verified, member_id=booking.member_id)


def require_verified_booking_owner(booking_id: int) -> None:
    """Dependency for routes with a {booking_id} path parameter (e.g. paying)."""
    ensure_email_verified(booking_id=booking_id)
