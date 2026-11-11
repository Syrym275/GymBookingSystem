import os
from decimal import Decimal

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from .models import BookingCreateRequest, BookingResponse


router = APIRouter(prefix="/bookings", tags=["Bookings"])


def database_error(error: psycopg.Error) -> HTTPException:

    if error.sqlstate == "23P01":
        return HTTPException(status_code=409, detail="This slot was just taken.")

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
        with psycopg.connect(
            os.environ["DATABASE_URL"],
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
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
def list_member_bookings(member_id: int) -> list[BookingResponse]:
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
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
                    WHERE member_id = %s
                    ORDER BY start_time DESC, booking_id DESC
                    """,
                    (member_id,),
                )

                rows = cursor.fetchall()

        return [BookingResponse(**row) for row in rows]

    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
@router.post("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(booking_id: int) -> BookingResponse:
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")

                cursor.execute(
                    """
                    SELECT status
                    FROM bookings
                    WHERE booking_id = %s
                    FOR UPDATE
                    """,
                    (booking_id,),
                )

                existing = cursor.fetchone()

                if existing is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Booking not found.",
                    )

                previous_status = existing["status"]

                if previous_status not in {"pending", "confirmed"}:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Only pending or confirmed bookings "
                            "can be cancelled."
                        ),
                    )

                if previous_status == "confirmed":
                    cursor.execute(
                        """
                        UPDATE payments
                        SET payment_status = 'refunded'
                        WHERE booking_id = %s
                          AND payment_status = 'approved'
                        """,
                        (booking_id,),
                    )

                cursor.execute(
                    """
                    UPDATE bookings
                    SET status = 'cancelled'
                    WHERE booking_id = %s
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

                booking = cursor.fetchone()

        return BookingResponse(**booking)

    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None

@router.get("/{booking_id}", response_model=BookingResponse)

def get_booking(booking_id: int) -> BookingResponse:
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
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


@router.post("/{booking_id}/expire", response_model=BookingResponse)
def expire_booking(booking_id: int) -> BookingResponse:
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
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