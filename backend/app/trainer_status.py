import logging

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row

from .db import connect
from .models import (
    CurrentUserResponse,
    PublicTrainerAvailabilityResponse,
    TrainerAvailabilityResponse,
    TrainerAvailabilityUpdateRequest,
)
from .security import current_user, require_roles


router = APIRouter(prefix="/trainers", tags=["Trainers"])
logger = logging.getLogger(__name__)


def _availability_query() -> str:
    return """
        SELECT
            trainer_id,
            CASE
                WHEN availability_status = 'break'
                     AND availability_break_until IS NOT NULL
                     AND availability_break_until <= CURRENT_TIMESTAMP
                    THEN 'available'
                ELSE availability_status
            END AS state,
            COALESCE(availability_note, '') AS note,
            availability_break_until AS break_until,
            availability_updated_at AS updated_at
        FROM trainers
        WHERE trainer_id = %s
    """


@router.get("/me/availability", response_model=TrainerAvailabilityResponse)
def get_my_availability(
    user: CurrentUserResponse = Depends(require_roles("trainer")),
) -> TrainerAvailabilityResponse:
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(_availability_query(), (user.trainer_id,))
                row = cursor.fetchone()
    except psycopg.Error:
        logger.exception("Trainer availability read failed")
        raise HTTPException(status_code=503, detail="Trainer availability service unavailable.") from None

    if row is None:
        raise HTTPException(status_code=404, detail="Trainer profile not found.")
    return TrainerAvailabilityResponse(**row)


@router.get("/{trainer_id}/availability", response_model=PublicTrainerAvailabilityResponse)
def get_trainer_availability(
    trainer_id: int,
    user: CurrentUserResponse = Depends(current_user),
) -> PublicTrainerAvailabilityResponse:
    if trainer_id < 1:
        raise HTTPException(status_code=422, detail="Invalid trainer.")
    if user.role == "trainer" and user.trainer_id != trainer_id:
        raise HTTPException(status_code=403, detail="You are not allowed to view this trainer's availability.")
    if user.role not in {"member", "trainer", "receptionist", "admin"}:
        raise HTTPException(status_code=403, detail="Your account is not allowed to view trainer availability.")

    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        trainer_id,
                        CASE
                            WHEN availability_status = 'break'
                                 AND availability_break_until IS NOT NULL
                                 AND availability_break_until <= CURRENT_TIMESTAMP
                                THEN 'available'
                            ELSE availability_status
                        END AS state,
                        availability_break_until AS break_until,
                        availability_updated_at AS updated_at,
                        is_active
                    FROM trainers
                    WHERE trainer_id = %s
                    """,
                    (trainer_id,),
                )
                row = cursor.fetchone()
    except psycopg.Error:
        logger.exception("Trainer availability read failed")
        raise HTTPException(status_code=503, detail="Trainer availability service unavailable.") from None

    if row is None or user.role == "member" and not row["is_active"]:
        raise HTTPException(status_code=404, detail="Trainer not found.")
    return PublicTrainerAvailabilityResponse(**row)


@router.patch("/me/availability", response_model=TrainerAvailabilityResponse)
def update_my_availability(
    input: TrainerAvailabilityUpdateRequest,
    user: CurrentUserResponse = Depends(require_roles("trainer")),
) -> TrainerAvailabilityResponse:
    note = " ".join(input.note.split())
    break_until = input.break_until.replace(tzinfo=None) if input.break_until else None
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE trainers
                    SET availability_status = %s,
                        availability_break_until = CASE WHEN %s = 'break' THEN %s ELSE NULL END,
                        availability_note = NULLIF(%s, ''),
                        availability_updated_at = CURRENT_TIMESTAMP
                    WHERE trainer_id = %s
                    RETURNING
                        trainer_id,
                        availability_status AS state,
                        COALESCE(availability_note, '') AS note,
                        availability_break_until AS break_until,
                        availability_updated_at AS updated_at
                    """,
                    (input.state, input.state, break_until, note, user.trainer_id),
                )
                row = cursor.fetchone()
    except psycopg.Error:
        logger.exception("Trainer availability update failed")
        raise HTTPException(status_code=503, detail="Trainer availability service unavailable.") from None

    if row is None:
        raise HTTPException(status_code=404, detail="Trainer profile not found.")
    return TrainerAvailabilityResponse(**row)
