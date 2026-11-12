import re
import secrets
import logging

import bcrypt
import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.errors import UniqueViolation

from .db import connect, is_valid_email
from .models import (
    CurrentUserResponse,
    LoginRequest,
    RegisterRequest,
    TrainerRegisterRequest,
    TrainerRegistrationResponse,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_new_password(password: str) -> None:
    """Applies to new passwords only, so older accounts can still log in."""
    has_capital = any(char.isupper() for char in password)
    has_symbol = any(not char.isalnum() and not char.isspace() for char in password)

    if len(password) < 8 or not has_capital or not has_symbol:
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters and include a capital letter and a symbol.",
        )

    # bcrypt only accepts 72 bytes; non-Latin letters take 2 or more bytes each.
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=422,
            detail="Password is too long. Use at most 72 bytes (about 36 non-Latin letters).",
        )


def database_unavailable(action: str) -> HTTPException:
    logger.exception("%s database query failed", action)
    return HTTPException(
        status_code=503,
        detail=f"{action} is temporarily unavailable. Check the backend log.",
    )


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

    if len(full_name) < 2:
        raise HTTPException(status_code=422, detail="Please enter your full name.")

    if not is_valid_email(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email.")

    if phone is None:
        raise HTTPException(
            status_code=422,
            detail="Phone must be a Kazakhstan number.",
        )

    check_new_password(input.password)
    password_hash = hash_password(input.password)

    qr_code_token = secrets.token_hex(32)

    try:
        with connect() as connection:
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
    except psycopg.Error:
        raise database_unavailable("Registration") from None


@router.post(
    "/register/trainer",
    response_model=TrainerRegistrationResponse,
    status_code=201,
)
def register_trainer(input: TrainerRegisterRequest) -> TrainerRegistrationResponse:
    full_name = " ".join(input.full_name.split())
    specialization = " ".join(input.specialization.split())
    email = input.email.strip().lower()

    if len(full_name) < 2:
        raise HTTPException(status_code=422, detail="Please enter your full name.")

    if len(specialization) < 2:
        raise HTTPException(status_code=422, detail="Please enter your specialization.")

    if not is_valid_email(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email.")

    check_new_password(input.password)
    password_hash = hash_password(input.password)

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                # Inactive trainers stay off the public catalogue until approved.
                cursor.execute(
                    """
                    INSERT INTO trainers (
                        full_name,
                        specialization,
                        session_price_kzt,
                        is_active
                    )
                    VALUES (%s, %s, %s, FALSE)
                    RETURNING trainer_id
                    """,
                    (full_name, specialization, input.session_price_kzt),
                )

                trainer_id = cursor.fetchone()[0]

                cursor.execute(
                    """
                    INSERT INTO users (
                        email,
                        password_hash,
                        role,
                        trainer_id
                    )
                    VALUES (%s, %s, 'trainer', %s)
                    """,
                    (email, password_hash, trainer_id),
                )

        return TrainerRegistrationResponse(
            trainer_id=trainer_id,
            full_name=full_name,
            email=email,
        )

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        ) from None
    except psycopg.Error:
        raise database_unavailable("Trainer registration") from None


@router.post(
    "/login",
    response_model=CurrentUserResponse,
)
def login(input: LoginRequest) -> CurrentUserResponse:
    email = input.email.strip().lower()

    try:
        with connect() as connection:
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

    if row[3] == "trainer":
        raise HTTPException(
            status_code=403,
            detail="Your trainer registration is saved, but trainer sign-in is not available yet.",
        )

    return CurrentUserResponse(
        user_id=row[0],
        email=row[1],
        role=row[3],
        member_id=row[4],
        full_name=row[5],
    )
