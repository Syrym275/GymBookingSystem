import hashlib
import hmac
import re
import secrets
import logging

import bcrypt
import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.errors import UniqueViolation

from .db import connect, is_valid_email
from .email_domain import email_domain_exists
from .mailer import send_verification_code
from .models import (
    CurrentUserResponse,
    LoginRequest,
    RegisterRequest,
    RegistrationPendingResponse,
    ResendCodeRequest,
    TrainerRegisterRequest,
    TrainerRegistrationResponse,
    VerifyEmailRequest,
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


def check_email_domain(email: str) -> None:
    # Checked last, after the cheap checks, because it makes a DNS lookup.
    if not email_domain_exists(email):
        domain = email.rsplit("@", 1)[1]
        raise HTTPException(
            status_code=422,
            detail=f"The email domain {domain} does not exist or cannot receive mail. Check the address.",
        )


CODE_MINUTES = 15  # how long an emailed code works
RESEND_SECONDS = 60  # minimum gap between two emails to the same account
MAX_CODE_ATTEMPTS = 5  # wrong guesses allowed per code


def code_hash(user_id: int, code: str) -> str:
    # Only the hash is stored, so a database leak does not expose live codes.
    return hashlib.sha256(f"{user_id}:{code}".encode("utf-8")).hexdigest()


def store_new_code(cursor, user_id: int) -> str:
    """Create (or replace) the user's confirmation code and return it for emailing."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    cursor.execute(
        """
        INSERT INTO email_verifications (user_id, code_hash, expires_at, sent_at, attempts)
        VALUES (%s, %s, CURRENT_TIMESTAMP + make_interval(mins => %s), CURRENT_TIMESTAMP, 0)
        ON CONFLICT (user_id) DO UPDATE
        SET code_hash = EXCLUDED.code_hash,
            expires_at = EXCLUDED.expires_at,
            sent_at = EXCLUDED.sent_at,
            attempts = 0
        """,
        (user_id, code_hash(user_id, code), CODE_MINUTES),
    )
    return code


def deliver_code(email: str, code: str) -> bool:
    try:
        send_verification_code(email, code, CODE_MINUTES)
        return True
    except Exception:  # SMTP problems must not lose the saved account
        logger.exception("Could not send the confirmation email to %s", email)
        return False


@router.post(
    "/register",
    response_model=RegistrationPendingResponse,
    status_code=201,
)
def register(input: RegisterRequest) -> RegistrationPendingResponse:
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
                        member_id,
                        email_verified
                    )
                    VALUES (%s, %s, 'member', %s, FALSE)
                    RETURNING user_id
                    """,
                    (email, password_hash, member_id),
                )

                user_id = cursor.fetchone()[0]
                code = store_new_code(cursor, user_id)

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email or phone already exists.",
        ) from None
    except psycopg.Error:
        raise database_unavailable("Registration") from None

    # Sent after the commit, so the account exists even if mail fails (the user can resend).
    return RegistrationPendingResponse(email=email, email_sent=deliver_code(email, code))


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
                        trainer_id,
                        email_verified
                    )
                    VALUES (%s, %s, 'trainer', %s, FALSE)
                    RETURNING user_id
                    """,
                    (email, password_hash, trainer_id),
                )

                user_id = cursor.fetchone()[0]
                code = store_new_code(cursor, user_id)

    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        ) from None
    except psycopg.Error:
        raise database_unavailable("Trainer registration") from None

    return TrainerRegistrationResponse(
        trainer_id=trainer_id,
        full_name=full_name,
        email=email,
        email_sent=deliver_code(email, code),
    )


@router.post("/verify-email", response_model=CurrentUserResponse)
def verify_email(input: VerifyEmailRequest) -> CurrentUserResponse:
    email = input.email.strip().lower()
    code = input.code.strip()

    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=422, detail="Enter the 6-digit code from the email.")

    outcome = "unknown"
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.email,
                        u.role,
                        u.member_id,
                        u.trainer_id,
                        u.email_verified,
                        COALESCE(
                            m.full_name,
                            t.full_name,
                            INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))
                        ) AS full_name,
                        v.code_hash,
                        v.attempts,
                        v.expires_at > CURRENT_TIMESTAMP AS code_still_valid
                    FROM users u
                    LEFT JOIN members m ON m.member_id = u.member_id
                    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
                    LEFT JOIN email_verifications v ON v.user_id = u.user_id
                    WHERE LOWER(BTRIM(u.email)) = %s
                      AND u.is_active = TRUE
                    FOR UPDATE OF u
                    """,
                    (email,),
                )
                row = cursor.fetchone()

                if row is None:
                    outcome = "unknown"
                elif row[5]:
                    outcome = "already_verified"
                elif row[7] is None:
                    outcome = "no_code"
                elif row[8] >= MAX_CODE_ATTEMPTS:
                    outcome = "locked"
                elif not row[9]:
                    outcome = "expired"
                elif not hmac.compare_digest(row[7], code_hash(row[0], code)):
                    # Saved before the error is raised, so the attempt counts.
                    cursor.execute(
                        "UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = %s",
                        (row[0],),
                    )
                    outcome = "wrong"
                else:
                    cursor.execute("UPDATE users SET email_verified = TRUE WHERE user_id = %s", (row[0],))
                    cursor.execute("DELETE FROM email_verifications WHERE user_id = %s", (row[0],))
                    outcome = "verified"
    except psycopg.Error:
        raise database_unavailable("Email confirmation") from None

    errors = {
        "unknown": (400, "Wrong code. Check the email and try again."),
        "wrong": (400, "Wrong code. Check the email and try again."),
        "already_verified": (409, "This email is already confirmed. Please log in."),
        "no_code": (400, "There is no active code for this email. Request a new one."),
        "locked": (429, "Too many wrong codes. Request a new one."),
        "expired": (410, "This code has expired. Request a new one."),
    }
    if outcome in errors:
        status_code, detail = errors[outcome]
        raise HTTPException(status_code=status_code, detail=detail)

    return CurrentUserResponse(
        user_id=row[0],
        email=row[1],
        role=row[2],
        member_id=row[3],
        trainer_id=row[4],
        full_name=row[6],
    )


@router.post("/resend-code", status_code=202)
def resend_code(input: ResendCodeRequest) -> dict[str, str]:
    email = input.email.strip().lower()
    code = None
    too_soon = False

    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.email_verified,
                        COALESCE(v.sent_at > CURRENT_TIMESTAMP - make_interval(secs => %s), FALSE)
                    FROM users u
                    LEFT JOIN email_verifications v ON v.user_id = u.user_id
                    WHERE LOWER(BTRIM(u.email)) = %s
                      AND u.is_active = TRUE
                    FOR UPDATE OF u
                    """,
                    (RESEND_SECONDS, email),
                )
                row = cursor.fetchone()

                if row is not None and not row[1]:
                    too_soon = row[2]
                    if not too_soon:
                        code = store_new_code(cursor, row[0])
    except psycopg.Error:
        raise database_unavailable("Email confirmation") from None

    if too_soon:
        raise HTTPException(status_code=429, detail="Please wait a minute before asking for a new code.")

    if code is not None and not deliver_code(email, code):
        raise HTTPException(status_code=503, detail="Could not send the email right now. Try again shortly.")

    # Same answer whether or not the account exists, so this cannot be used to look up emails.
    return {"detail": "If this account still needs confirming, a new code has been sent."}


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
                        ) AS full_name,
                        u.email_verified
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

    if not row[6]:
        # The header lets the frontend offer the confirmation screen.
        raise HTTPException(
            status_code=403,
            detail="Please confirm your email first. Enter the code we sent you.",
            headers={"X-Error-Code": "email_not_verified"},
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
