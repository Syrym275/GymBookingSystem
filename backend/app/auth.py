import re
import secrets
import logging

import bcrypt
import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from psycopg.errors import UniqueViolation

from .audit import record, record_separately
from .db import connect, is_valid_email
from .email_domain import email_domain_exists
from .verification import issue_token, send_verification_email
from .models import (
    CurrentUserResponse,
    LoginRequest,
    RegisterRequest,
    TrainerRegisterRequest,
    TrainerRegistrationResponse,
)
from .security import clear_session, create_session, current_user


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


def check_email_domain(email: str) -> None:
    # Checked last, after the cheap checks, because it makes a DNS lookup.
    if not email_domain_exists(email):
        domain = email.rsplit("@", 1)[1]
        raise HTTPException(
            status_code=422,
            detail=f"The email domain {domain} does not exist or cannot receive mail. Check the address.",
        )


@router.post(
    "/register",
    response_model=CurrentUserResponse,
    status_code=201,
)
def register(input: RegisterRequest, response: Response) -> CurrentUserResponse:
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
    check_email_domain(email)
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
                token = issue_token(cursor, user_id)
                record(
                    cursor,
                    "member.registered",
                    actor_user_id=user_id,
                    actor_email=email,
                    actor_role="member",
                    target_type="member",
                    target_id=member_id,
                    details={"membership_plan": input.membership_plan},
                )

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email or phone already exists.",
        ) from None
    except psycopg.Error:
        raise database_unavailable("Registration") from None

    # Sent after the commit: if mail fails the account is kept and the user can resend.
    result = CurrentUserResponse(
        user_id=user_id,
        full_name=full_name,
        email=email,
        role="member",
        member_id=member_id,
        email_verified=False,
        verification_email_sent=send_verification_email(email, token),
    )
    create_session(user_id, response)
    return result


@router.post(
    "/register/trainer",
    response_model=TrainerRegistrationResponse,
    status_code=201,
)
def register_trainer(input: TrainerRegisterRequest, response: Response) -> TrainerRegistrationResponse:
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
    check_email_domain(email)
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
                    RETURNING user_id
                    """,
                    (email, password_hash, trainer_id),
                )

                user_id = cursor.fetchone()[0]
                token = issue_token(cursor, user_id)
                # Shows up in the admin's "Trainer applications" list until approved or rejected.
                record(
                    cursor,
                    "trainer.registered",
                    actor_user_id=user_id,
                    actor_email=email,
                    actor_role="trainer",
                    target_type="trainer",
                    target_id=trainer_id,
                    details={"full_name": full_name, "specialization": specialization},
                )

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        ) from None
    except psycopg.Error:
        raise database_unavailable("Trainer registration") from None

    result = TrainerRegistrationResponse(
        trainer_id=trainer_id,
        full_name=full_name,
        email=email,
        verification_email_sent=send_verification_email(email, token),
    )
    return result


@router.post(
    "/login",
    response_model=CurrentUserResponse,
)
def login(input: LoginRequest, response: Response) -> CurrentUserResponse:
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
                        u.trainer_id,
                        COALESCE(
                            m.full_name,
                            t.full_name,
                            u.full_name,
                            INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
                        ) AS full_name,
                        t.specialization,
                        t.session_price_kzt,
                        t.is_active AS trainer_is_active,
                        u.email_verified
                    FROM users u
                    LEFT JOIN members m ON m.member_id = u.member_id
                    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
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
        record_separately(
            "auth.login_failed",
            actor_user_id=row[0] if row is not None else None,
            actor_email=email,
            actor_role=row[3] if row is not None else None,
        )
        raise HTTPException(
            status_code=401,
            detail="Wrong email or password.",
        )

    result = CurrentUserResponse(
        user_id=row[0],
        email=row[1],
        role=row[3],
        member_id=row[4],
        trainer_id=row[5],
        full_name=row[6],
        trainer_specialization=row[7],
        trainer_session_price_kzt=row[8],
        trainer_is_active=row[9],
        email_verified=row[10],
    )
    create_session(row[0], response)
    record_separately("auth.login", actor_user_id=row[0], actor_email=row[1], actor_role=row[3])
    return result


@router.get("/me", response_model=CurrentUserResponse)
def me(user: CurrentUserResponse = Depends(current_user)) -> CurrentUserResponse:
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    clear_session(request, response)
