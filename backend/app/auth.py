import os
import re
import secrets
import logging

import bcrypt
import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.errors import UniqueViolation

from .models import CurrentUserResponse, LoginRequest, RegisterRequest


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


def normalize_phone(raw: str) -> str | None:
    value = re.sub(r"[\s()-]", "", raw)

    if value.startswith("+7"):
        digits = value[2:]
    elif re.fullmatch(r"[78]\d{10}", value):
        digits = value[1:]
    elif re.fullmatch(r"\d{10}", value):
        digits = value
    else:
        return None

    return f"+7{digits}" if re.fullmatch(r"\d{10}", digits) else None


@router.post(
    "/register",
    response_model=CurrentUserResponse,
    status_code=201,
)
def register(input: RegisterRequest) -> CurrentUserResponse:
    full_name = " ".join(input.full_name.split())
    email = input.email.strip().lower()
    phone = normalize_phone(input.phone)

    if not re.fullmatch(r"\S+@\S+\.\S+", email):
        raise HTTPException(status_code=422, detail="Please enter a valid email.")

    if phone is None:
        raise HTTPException(
            status_code=422,
            detail="Phone must be a Kazakhstan number.",
        )

    password_hash = bcrypt.hashpw(
        input.password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")

    qr_code_token = secrets.token_hex(32)

    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO members (
                        full_name,
                        email,
                        phone,
                        qr_code_token,
                        membership_plan,
                        membership_expires_on
                    )
                    VALUES (
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        (
                            CURRENT_DATE +
                            CASE %s
                                WHEN 'monthly' THEN INTERVAL '1 month'
                                WHEN 'quarterly' THEN INTERVAL '3 months'
                                WHEN 'annual' THEN INTERVAL '12 months'
                            END
                        )::date
                    )
                    RETURNING member_id
                    """,
                    (
                        full_name,
                        email,
                        phone,
                        qr_code_token,
                        input.membership_plan,
                        input.membership_plan,
                    ),
                )

                member_id = cursor.fetchone()[0]

                cursor.execute(
                    """
                    INSERT INTO users (
                        email,
                        password_hash,
                        role,
                        member_id
                    )
                    VALUES (%s, %s, 'member', %s)
                    RETURNING user_id
                    """,
                    (email, password_hash, member_id),
                )

                user_id = cursor.fetchone()[0]

        return CurrentUserResponse(
            user_id=user_id,
            full_name=full_name,
            email=email,
            role="member",
            member_id=member_id,
        )

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email or phone already exists.",
        ) from None

@router.post(
    "/login",
    response_model=CurrentUserResponse,
)
def login(input: LoginRequest) -> CurrentUserResponse:
    email = input.email.strip().lower()

    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.email,
                        u.password_hash,
                        u.role,
                        u.member_id,
                        COALESCE(
                            m.full_name,
                            INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
                        ) AS full_name
                    FROM users u
                    LEFT JOIN members m ON m.member_id = u.member_id
                    WHERE LOWER(BTRIM(u.email)) = %s
                      AND u.is_active = TRUE
                    """,
                    (email,),
                )

                row = cursor.fetchone()
    except KeyError:
        raise HTTPException(
            status_code=503,
            detail="Login service is missing its database configuration.",
        ) from None
    except psycopg.Error:
        logger.exception("Login database query failed")
        raise HTTPException(
            status_code=503,
            detail="Login service could not read the account. Check the backend log.",
        ) from None

    valid_password = False
    if row is not None:
        try:
            valid_password = bcrypt.checkpw(
                input.password.encode("utf-8"),
                row[2].encode("utf-8"),
            )
        except (ValueError, TypeError):
            # Malformed or legacy hashes should fail as invalid credentials,
            # rather than turning a login attempt into a server error.
            valid_password = False

    if not valid_password:
        raise HTTPException(
            status_code=401,
            detail="Wrong email or password.",
        )

    return CurrentUserResponse(
        user_id=row[0],
        email=row[1],
        role=row[3],
        member_id=row[4],
        full_name=row[5],
    )
