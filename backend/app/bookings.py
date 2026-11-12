from decimal import Decimal
from datetime import date, datetime, time, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from .db import connect
from .models import BookingCreateRequest, BookingResponse


router = APIRouter(prefix="/bookings", tags=["Bookings"])


@router.get("/availability")
def booking_availability(
    booking_type: Literal["training", "hall_rental"],
    resource_id: int,
    date: date,
    member_id: int | None = None,
) -> dict[str, list[int]]:
    """Return hourly slots blocked by pending or confirmed bookings."""
    if resource_id < 1:
        raise HTTPException(status_code=422, detail="Invalid resource.")

    start_of_day = datetime.combine(date, time.min)
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                taken: list[int] = []
                for hour in range(7, 22):
                    start = start_of_day + timedelta(hours=hour)
                    end = start + timedelta(hours=1)
                    cursor.execute(
                        """
                        SELECT EXISTS (
                            SELECT 1 FROM bookings
                            WHERE ((booking_type = %s
                                    AND CASE WHEN booking_type = 'training' THEN trainer_id ELSE hall_id END = %s)
                                   OR member_id = COALESCE(%s::integer, -1))
                              AND status NOT IN ('cancelled', 'expired')
                              AND start_time < %s AND end_time > %s
                        )
                        """,
                        (booking_type, resource_id, member_id, end, start),
                    )
                    if cursor.fetchone()[0]:
                        taken.append(hour)
        return {"taken_hours": taken}
    except psycopg.Error as error:
        raise database_error(error) from None


def database_error(error: psycopg.Error) -> HTTPException:

    if error.sqlstate == "23P01":
        constraint = getattr(error.diag, "constraint_name", None)
        if constraint == "excl_member_no_overlap":
            detail = "You already have another booking during this time. Choose a different time."
        elif constraint == "excl_trainer_no_overlap":
            detail = "This trainer is already booked at that time. Choose a different slot."
        elif constraint == "excl_hall_no_overlap":
            detail = "This hall is already booked at that time. Choose a different slot."
        else:
            detail = "This slot conflicts with an existing booking. Choose a different time."
        return HTTPException(status_code=409, detail=detail)

    if error.sqlstate == "GB001":
        return HTTPException(
            status_code=409,
            detail="You already have two unpaid bookings.",
        )

    if error.sqlstate == "GB002":
        return HTTPException(
            status_code=409,
            detail="Your membership is not valid for this date.",
        )

    if error.sqlstate in {"23503", "23514"}:
        return HTTPException(status_code=422, detail="Invalid booking data.")

    return HTTPException(status_code=503, detail="Booking service unavailable.")


@router.post("", response_model=BookingResponse, status_code=201)
def create_booking(input: BookingCreateRequest) -> BookingResponse:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT %s::timestamp <= LOCALTIMESTAMP AS starts_in_past",
                    (input.start_time,),
                )
                if cursor.fetchone()["starts_in_past"]:
                    raise HTTPException(status_code=409, detail="Bookings must start in the future.")

                cursor.execute("SELECT expire_pending_bookings()")

                if input.booking_type == "training":
                    cursor.execute(
                        """
                        SELECT session_price_kzt
                        FROM trainers
                        WHERE trainer_id = %s
                          AND is_active = TRUE
                        """,
                        (input.trainer_id,),
                    )

                    resource = cursor.fetchone()

                    if resource is None:
                        raise HTTPException(
                            status_code=404,
                            detail="Trainer not found.",
                        )

                    price = resource["session_price_kzt"]
                    trainer_id = input.trainer_id
                    hall_id = None

                    # Serialize API bookings for this trainer without requiring
                    # UPDATE privilege on the trainers table.
                    cursor.execute("SELECT pg_advisory_xact_lock(%s, %s)", (2026, trainer_id))
                    cursor.execute(
                        """
                        SELECT EXISTS (
                            SELECT 1
                            FROM bookings
                            WHERE booking_type = 'training'
                              AND trainer_id = %s
                              AND status NOT IN ('cancelled', 'expired')
                              AND start_time < %s
                              AND end_time > %s
                        ) AS trainer_busy
                        """,
                        (trainer_id, input.end_time, input.start_time),
                    )
                    if cursor.fetchone()["trainer_busy"]:
                        raise HTTPException(
                            status_code=409,
                            detail="This trainer is already booked at that time.",
                        )

                else:
                    cursor.execute(
                        """
                        SELECT hourly_rate_kzt
                        FROM halls
                        WHERE hall_id = %s
                          AND is_active = TRUE
                        """,
                        (input.hall_id,),
                    )

                    resource = cursor.fetchone()

                    if resource is None:
                        raise HTTPException(
                            status_code=404,
                            detail="Hall not found.",
                        )

                    duration_seconds = (
                        input.end_time - input.start_time
                    ).total_seconds()

                    price = (
                        resource["hourly_rate_kzt"]
                        * Decimal(str(duration_seconds))
                        / Decimal("3600")
                    ).quantize(Decimal("0.01"))

                    trainer_id = None
                    hall_id = input.hall_id

                cursor.execute(
                    """
                    INSERT INTO bookings (
                        member_id,
                        booking_type,
                        trainer_id,
                        hall_id,
                        start_time,
                        end_time,
                        status,
                        price_kzt,
                        payment_expires_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s,
                        'pending',
                        %s,
                        CURRENT_TIMESTAMP + INTERVAL '15 minutes'
                    )
                    RETURNING
                        booking_id,
                        member_id,
                        booking_type,
                        trainer_id,
                        hall_id,
                        start_time,
                        end_time,
                        status,
                        price_kzt,
                        created_at,
                        payment_expires_at
                    """,
                    (
                        input.member_id,
                        input.booking_type,
                        trainer_id,
                        hall_id,
                        input.start_time,
                        input.end_time,
                        price,
                    ),
                )

                row = cursor.fetchone()

        return BookingResponse(**row)

    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.get("", response_model=list[BookingResponse])
def list_member_bookings(
    member_id: int | None = None,
    trainer_id: int | None = None,
) -> list[BookingResponse]:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")

                cursor.execute(
                    """
                    SELECT
                        b.booking_id,
                        b.member_id,
                        b.booking_type,
                        b.trainer_id,
                        b.hall_id,
                        b.start_time,
                        b.end_time,
                        b.status,
                        b.price_kzt,
                        b.created_at,
                        b.payment_expires_at,
                        m.full_name AS member_name,
                        CASE WHEN %s::integer IS NULL THEN m.phone ELSE NULL END AS member_phone,
                        m.membership_plan AS member_membership_plan,
                        m.membership_expires_on AS member_membership_expires_on,
                        t.full_name AS trainer_name,
                        h.hall_name AS hall_name,
                        latest_payment.payment_status,
                        latest_payment.method AS payment_method,
                        CASE
                            WHEN latest_payment.payment_status IN ('approved', 'refunded')
                            THEN latest_payment.created_at
                            ELSE NULL
                        END AS paid_at
                    FROM bookings b
                    JOIN members m ON m.member_id = b.member_id
                    LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
                    LEFT JOIN halls h ON h.hall_id = b.hall_id
                    LEFT JOIN LATERAL (
                        SELECT payment_status, method, created_at
                        FROM payments
                        WHERE booking_id = b.booking_id
                        ORDER BY created_at DESC, payment_id DESC
                        LIMIT 1
                    ) AS latest_payment ON TRUE
                    WHERE (%s::integer IS NULL OR b.member_id = %s)
                      AND (%s::integer IS NULL OR (b.booking_type = 'training' AND b.trainer_id = %s))
                    ORDER BY b.start_time DESC, b.booking_id DESC
                    """,
                    (trainer_id, member_id, member_id, trainer_id, trainer_id),
                )

                rows = cursor.fetchall()

        return [BookingResponse(**row) for row in rows]

    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(booking_id: int) -> BookingResponse:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")

                cursor.execute(
                    """
                    UPDATE bookings
                    SET status = 'cancelled'
                    WHERE booking_id = %s
                      AND status = 'pending'
                    RETURNING
                        booking_id,
                        member_id,
                        booking_type,
                        trainer_id,
                        hall_id,
                        start_time,
                        end_time,
                        status,
                        price_kzt,
                        created_at,
                        payment_expires_at
                    """,
                    (booking_id,),
                )

                row = cursor.fetchone()

                if row is None:
                    cursor.execute(
                        """
                        SELECT status
                        FROM bookings
                        WHERE booking_id = %s
                        """,
                        (booking_id,),
                    )

                    existing = cursor.fetchone()

                    if existing is None:
                        raise HTTPException(
                            status_code=404,
                            detail="Booking not found.",
                        )

                    raise HTTPException(
                        status_code=409,
                        detail="Only pending bookings can be cancelled.",
                    )

        return BookingResponse(**row)

    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/{booking_id}/attendance", response_model=BookingResponse)
def mark_booking_attendance(
    booking_id: int,
    status: Literal["completed", "no_show"],
    trainer_id: int | None = None,
) -> BookingResponse:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE bookings
                    SET status = %s
                    WHERE booking_id = %s
                      AND (%s::integer IS NULL OR trainer_id = %s)
                      AND status = 'confirmed'
                      AND end_time <= LOCALTIMESTAMP
                    RETURNING booking_id
                    """,
                    (status, booking_id, trainer_id, trainer_id),
                )
                updated = cursor.fetchone()
                if updated is None:
                    cursor.execute("SELECT trainer_id, status, start_time::date FROM bookings WHERE booking_id = %s", (booking_id,))
                    existing = cursor.fetchone()
                    if existing is None:
                        raise HTTPException(status_code=404, detail="Booking not found.")
                    if trainer_id is not None and existing["trainer_id"] != trainer_id:
                        raise HTTPException(status_code=403, detail="This is not your session.")
                    raise HTTPException(
                        status_code=409,
                        detail="Only confirmed sessions that have ended can be marked attended.",
                    )

                cursor.execute(
                    """
                    SELECT
                        b.booking_id, b.member_id, b.booking_type, b.trainer_id, b.hall_id,
                        b.start_time, b.end_time, b.status, b.price_kzt, b.created_at,
                        b.payment_expires_at, m.full_name AS member_name,
                        CASE WHEN %s::integer IS NULL THEN m.phone ELSE NULL END AS member_phone,
                        m.membership_plan AS member_membership_plan,
                        m.membership_expires_on AS member_membership_expires_on,
                        t.full_name AS trainer_name, h.hall_name AS hall_name
                    FROM bookings b
                    JOIN members m ON m.member_id = b.member_id
                    LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
                    LEFT JOIN halls h ON h.hall_id = b.hall_id
                    WHERE b.booking_id = %s
                    """,
                    (trainer_id, booking_id),
                )
                row = cursor.fetchone()
        return BookingResponse(**row)
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None

@router.get("/{booking_id}", response_model=BookingResponse)

def get_booking(booking_id: int) -> BookingResponse:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")

                cursor.execute(
                    """
                    SELECT
                        b.booking_id,
                        b.member_id,
                        b.booking_type,
                        b.trainer_id,
                        b.hall_id,
                        b.start_time,
                        b.end_time,
                        b.status,
                        b.price_kzt,
                        b.created_at,
                        b.payment_expires_at,
                        m.full_name AS member_name,
                        m.phone AS member_phone,
                        m.membership_plan AS member_membership_plan,
                        m.membership_expires_on AS member_membership_expires_on,
                        t.full_name AS trainer_name,
                        h.hall_name AS hall_name
                    FROM bookings b
                    JOIN members m ON m.member_id = b.member_id
                    LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
                    LEFT JOIN halls h ON h.hall_id = b.hall_id
                    WHERE b.booking_id = %s
                    """,
                    (booking_id,),
                )

                row = cursor.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Booking not found.")

        return BookingResponse(**row)

    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/{booking_id}/expire", response_model=BookingResponse)
def expire_booking(booking_id: int) -> BookingResponse:
    try:
        with connect(
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")

                cursor.execute(
                    """
                    SELECT
                        booking_id,
                        member_id,
                        booking_type,
                        trainer_id,
                        hall_id,
                        start_time,
                        end_time,
                        status,
                        price_kzt,
                        created_at,
                        payment_expires_at
                    FROM bookings
                    WHERE booking_id = %s
                    """,
                    (booking_id,),
                )

                row = cursor.fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Booking not found.")

        return BookingResponse(**row)

    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None
