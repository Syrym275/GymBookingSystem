"""SQL-aligned public catalogue, with optional read-only PostgreSQL access."""

import os

import psycopg
from psycopg.rows import dict_row

from .models import PublicCatalog, PublicHall, PublicTrainer


TRAINERS = (
    {"trainer_id": 1, "full_name": "Aigerim Sadykova", "specialization": "Strength training", "session_price_kzt": 8000, "is_active": True},
    {"trainer_id": 2, "full_name": "Arman Seitkali", "specialization": "Functional training", "session_price_kzt": 6500, "is_active": True},
    {"trainer_id": 3, "full_name": "Daniyar Ospanov", "specialization": "Boxing", "session_price_kzt": 7000, "is_active": True},
    {"trainer_id": 4, "full_name": "Zhanna Iskakova", "specialization": "Yoga and stretching", "session_price_kzt": 6000, "is_active": True},
    {"trainer_id": 5, "full_name": "Marat Zhaksylykov", "specialization": "CrossFit", "session_price_kzt": 7500, "is_active": False},
)

HALLS = (
    {"hall_id": 1, "hall_name": "Main Hall", "capacity": 40, "hourly_rate_kzt": 12000, "is_active": True},
    {"hall_id": 2, "hall_name": "Yoga Studio", "capacity": 20, "hourly_rate_kzt": 8000, "is_active": True},
    {"hall_id": 3, "hall_name": "Boxing Studio", "capacity": 15, "hourly_rate_kzt": 9000, "is_active": True},
    {"hall_id": 4, "hall_name": "Old Cardio Room", "capacity": 25, "hourly_rate_kzt": 6000, "is_active": False},
)


def data_source() -> str:
    return "postgresql" if os.environ.get("DATABASE_URL", "").strip() else "sample"


def get_catalog() -> PublicCatalog:
    if data_source() == "postgresql":
        return get_database_catalog()
    return get_sample_catalog()


def get_sample_catalog() -> PublicCatalog:
    # Response models select only the public fields; internal flags stay here.
    return PublicCatalog(
        trainers=[PublicTrainer.model_validate(row) for row in TRAINERS if row["is_active"]],
        halls=[PublicHall.model_validate(row) for row in HALLS if row["is_active"]],
    )


def get_database_catalog() -> PublicCatalog:
    # Read existing Task 9 tables only. Never execute the reference reset script.
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        connect_timeout=3,
        row_factory=dict_row,
        options="-c default_transaction_read_only=on -c statement_timeout=3000",
    ) as connection:
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
