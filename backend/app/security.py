import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Callable

import psycopg
from fastapi import Depends, HTTPException, Request, Response
from psycopg.rows import dict_row

from .db import connect
from .models import CurrentUserResponse


SESSION_COOKIE = "gym_session"
SESSION_TTL = timedelta(days=7)
logger = logging.getLogger(__name__)


def _session_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: int, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + SESSION_TTL
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO user_sessions (user_id, token_hash, expires_at)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, _session_hash(token), expires_at),
                )
    except psycopg.Error:
        logger.exception("Could not create authenticated session")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.") from None

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=os.environ.get("SESSION_COOKIE_SECURE", "").strip().lower() == "true",
        samesite="lax",
        path="/",
    )


def clear_session(request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        try:
            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM user_sessions WHERE token_hash = %s",
                        (_session_hash(token),),
                    )
        except psycopg.Error:
            logger.exception("Could not clear authenticated session")
            raise HTTPException(status_code=503, detail="Authentication service unavailable.") from None
    response.delete_cookie(SESSION_COOKIE, path="/")


def current_user(request: Request) -> CurrentUserResponse:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="You are not signed in.")

    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.email,
                        u.role,
                        u.member_id,
                        u.trainer_id,
                        COALESCE(
                            m.full_name,
                            t.full_name,
                            u.full_name,
                            INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
                        ) AS full_name,
                        t.specialization AS trainer_specialization,
                        t.session_price_kzt AS trainer_session_price_kzt,
                        t.is_active AS trainer_is_active,
                        u.email_verified
                    FROM user_sessions s
                    JOIN users u ON u.user_id = s.user_id
                    LEFT JOIN members m ON m.member_id = u.member_id
                    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
                    WHERE s.token_hash = %s
                      AND s.expires_at > CURRENT_TIMESTAMP
                      AND u.is_active = TRUE
                    """,
                    (_session_hash(token),),
                )
                row = cursor.fetchone()
    except psycopg.Error:
        logger.exception("Current-user database query failed")
        raise HTTPException(status_code=503, detail="Authentication service unavailable.") from None

    if row is None:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    return CurrentUserResponse(**row)


def require_verified_user(user: CurrentUserResponse = Depends(current_user)) -> CurrentUserResponse:
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before continuing.")
    return user


def require_roles(*roles: str) -> Callable:
    def dependency(user: CurrentUserResponse = Depends(current_user)) -> CurrentUserResponse:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Your account is not allowed to do this.")
        return user

    return dependency


def ensure_member_access(user: CurrentUserResponse, member_id: int) -> None:
    if user.role == "member" and user.member_id != member_id:
        raise HTTPException(status_code=403, detail="This is not your member account.")
    if user.role == "trainer":
        raise HTTPException(status_code=403, detail="Your account is not allowed to access member records.")


def ensure_booking_access(user: CurrentUserResponse, booking_id: int, *, write: bool = False) -> None:
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT member_id, trainer_id, booking_type FROM bookings WHERE booking_id = %s",
                    (booking_id,),
                )
                booking = cursor.fetchone()
    except psycopg.Error:
        logger.exception("Booking authorization query failed")
        raise HTTPException(status_code=503, detail="Booking service unavailable.") from None

    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found.")
    member_id, trainer_id, booking_type = booking
    allowed = (
        user.role in {"admin", "receptionist"}
        or user.role == "member" and user.member_id == member_id
        or user.role == "trainer" and booking_type in {"training", "combined"} and user.trainer_id == trainer_id
    )
    if not allowed or (write and user.role == "trainer"):
        raise HTTPException(status_code=403, detail="You are not allowed to access this booking.")
