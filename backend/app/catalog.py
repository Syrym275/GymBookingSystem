"""Read-only catalogue and professional trainer profiles from PostgreSQL."""

import os

from fastapi import HTTPException
from psycopg.rows import dict_row

from .db import connect
from .models import PublicCatalog, TrainerProfile


def data_source() -> str:
    return "postgresql" if os.environ.get("DATABASE_URL", "").strip() else "unconfigured"


def get_catalog() -> PublicCatalog:
    return get_database_catalog()


def _connect():
    """Pooled read-only connection with a 3 s statement timeout (see db.READ_ONLY_OPTIONS)."""
    return connect(row_factory=dict_row, read_only=True)


def get_database_catalog() -> PublicCatalog:
    # Read existing tables only. Never execute the reference reset script.
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT trainer_id, full_name, specialization, session_price_kzt "
                "FROM public.trainers WHERE is_active = TRUE ORDER BY trainer_id"
            )
            trainers = cursor.fetchall()
            cursor.execute(
                "SELECT hall_id, hall_name, capacity, hourly_rate_kzt "
                "FROM public.halls WHERE is_active = TRUE ORDER BY hall_id"
            )
            halls = cursor.fetchall()
    return PublicCatalog(trainers=trainers, halls=halls)


def get_trainer_profile(trainer_id: int) -> TrainerProfile:
    with _connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT trainer_id, full_name, specialization, session_price_kzt, is_active "
                "FROM public.trainers WHERE trainer_id = %s",
                (trainer_id,),
            )
            row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Trainer not found.")
    return TrainerProfile(**row)
