"""Public response shapes matching frontend/src/api/publicApi.ts."""

from decimal import Decimal
from typing import Annotated, Literal
from datetime import datetime

from pydantic import BaseModel, Field, PlainSerializer


# PostgreSQL NUMERIC(10,2) in Python; JSON numbers keep the React contract.
Money = Annotated[
    Decimal,
    Field(gt=0, max_digits=10, decimal_places=2),
    PlainSerializer(lambda value: float(value), return_type=float, when_used="json"),
]


class PublicTrainer(BaseModel):
    trainer_id: int = Field(gt=0)
    full_name: str = Field(min_length=1, max_length=100)
    specialization: str = Field(min_length=1, max_length=60)
    session_price_kzt: Money


class PublicHall(BaseModel):
    hall_id: int = Field(gt=0)
    hall_name: str = Field(min_length=1, max_length=60)
    capacity: int = Field(ge=1, le=200)
    hourly_rate_kzt: Money


class PublicCatalog(BaseModel):
    trainers: list[PublicTrainer]
    halls: list[PublicHall]


class HealthResponse(BaseModel):
    status: str
    service: str

class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=255)
    phone: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=6, max_length=72)
    membership_plan: Literal["monthly", "quarterly", "annual"]


class CurrentUserResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: Literal["member", "trainer", "receptionist", "admin"]
    member_id: int | None = None
    trainer_id: int | None = None

class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=72)

class BookingCreateRequest(BaseModel):
    member_id: int = Field(gt=0)
    booking_type: Literal["training", "hall_rental"]
    trainer_id: int | None = None
    hall_id: int | None = None
    start_time: datetime
    end_time: datetime


class BookingResponse(BaseModel):
    booking_id: int
    member_id: int
    booking_type: Literal["training", "hall_rental"]
    trainer_id: int | None
    hall_id: int | None
    start_time: datetime
    end_time: datetime
    status: str
    price_kzt: Money
    created_at: datetime
    payment_expires_at: datetime | None

class PaymentRequest(BaseModel):
    method: Literal["card", "nfc", "app"]
    outcome: Literal["approve", "decline"] = "approve"


class PaymentResponse(BaseModel):
    payment_id: int
    booking_id: int
    amount_kzt: Money
    method: str
    payment_status: str
    provider_txn_ref: str
    created_at: datetime


class PayResultResponse(BaseModel):
    payment: PaymentResponse
    booking: BookingResponse