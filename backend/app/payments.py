import logging
import secrets

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row

from .db import connect
from .models import (
    BookingResponse,
    PaymentRequest,
    PaymentResponse,
    PayResultResponse,
)
from .verification import require_verified_booking_owner


router = APIRouter(prefix="/bookings", tags=["Payments"])
logger = logging.getLogger(__name__)


@router.get(
    "/{booking_id}/payments",
    response_model=list[PaymentResponse],
    description=(
        "Read payment attempts for a booking. Local development API: verified "
        "session authentication and server-side ownership checks are not yet implemented."
    ),
)
def list_booking_payments(booking_id: int) -> list[PaymentResponse]:
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT booking_id FROM bookings WHERE booking_id = %s",
                    (booking_id,),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Booking not found.")

                cursor.execute(
                    """
                    SELECT payment_id, booking_id, amount_kzt, method,
                           payment_status, provider_txn_ref, created_at
                    FROM payments
                    WHERE booking_id = %s
                    ORDER BY created_at DESC, payment_id DESC
                    """,
                    (booking_id,),
                )
                rows = cursor.fetchall()
        return [PaymentResponse(**row) for row in rows]
    except psycopg.Error as error:
        logger.exception("Payment history database error (SQLSTATE %s)", error.sqlstate)
        raise HTTPException(
            status_code=503,
            detail="Payment history service unavailable.",
        ) from None


@router.post(
    "/{booking_id}/payment",
    response_model=PayResultResponse,
    dependencies=[Depends(require_verified_booking_owner)],
)
def pay_booking(
    booking_id: int,
    input: PaymentRequest,
) -> PayResultResponse:
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
                    FOR UPDATE
                    """,
                    (booking_id,),
                )

                booking = cursor.fetchone()

                if booking is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Booking not found.",
                    )

                if booking["status"] != "pending":
                    raise HTTPException(
                        status_code=409,
                        detail="This booking is no longer waiting for payment.",
                    )

                transaction_reference = (
                    f"TXN-{booking_id}-{secrets.token_hex(8)}"
                )

                if input.outcome == "approve":
                    cursor.execute(
                        """
                        SELECT confirm_booking_payment(%s, %s, %s, %s)
                        """,
                        (
                            booking_id,
                            booking["price_kzt"],
                            input.method,
                            transaction_reference,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO payments (
                            booking_id,
                            amount_kzt,
                            method,
                            payment_status,
                            provider_txn_ref
                        )
                        VALUES (%s, %s, %s, 'declined', %s)
                        """,
                        (
                            booking_id,
                            booking["price_kzt"],
                            input.method,
                            transaction_reference,
                        ),
                    )

                cursor.execute(
                    """
                    SELECT
                        payment_id,
                        booking_id,
                        amount_kzt,
                        method,
                        payment_status,
                        provider_txn_ref,
                        created_at
                    FROM payments
                    WHERE provider_txn_ref = %s
                    """,
                    (transaction_reference,),
                )

                payment = cursor.fetchone()

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

                updated_booking = cursor.fetchone()

        return PayResultResponse(
            payment=PaymentResponse(**payment),
            booking=BookingResponse(**updated_booking),
        )

    except HTTPException:
        raise
    except psycopg.Error as error:
        logger.exception("Payment database error (SQLSTATE %s)", error.sqlstate)

        raise HTTPException(
            status_code=503,
            detail="Payment service unavailable.",
        ) from None
