"""Public response shapes matching frontend/src/api/publicApi.ts."""

from decimal import Decimal
from typing import Annotated, Literal
from datetime import date, datetime

from pydantic import BaseModel, Field, PlainSerializer, model_validator


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
    password: str = Field(min_length=8, max_length=72)
    membership_plan: Literal["monthly", "quarterly", "annual"]


class TrainerRegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=72)
    specialization: str = Field(min_length=2, max_length=60)
    session_price_kzt: Money


class TrainerRegistrationResponse(BaseModel):
    trainer_id: int
    full_name: str
    email: str
    status: Literal["verification_required"] = "verification_required"
    email_sent: bool = True


class RegistrationPendingResponse(BaseModel):
    """Sign-up saved; the account works once the emailed code is entered."""
    email: str
    status: Literal["verification_required"] = "verification_required"
    email_sent: bool = True


class VerifyEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(max_length=20)  # format checked in the endpoint for a clearer message


class ResendCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class CurrentUserResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: Literal["member", "trainer", "receptionist", "admin"]
    member_id: int | None = None
    trainer_id: int | None = None


class MemberResponse(BaseModel):
    member_id: int
    full_name: str
    email: str
    phone: str
    qr_code_token: str
    membership_plan: Literal["monthly", "quarterly", "annual"]
    membership_expires_on: date
    created_at: datetime


class MemberDirectoryResponse(BaseModel):
    member_id: int
    full_name: str
    phone: str
    membership_plan: Literal["monthly", "quarterly", "annual"]
    membership_expires_on: date

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

    @model_validator(mode="after")
    def check_resource_and_times(self) -> "BookingCreateRequest":
        # The database enforces these too; checking here gives a clear message.
        if self.end_time <= self.start_time:
            raise ValueError("The end time must be after the start time.")
        if self.booking_type == "training":
            if self.trainer_id is None or self.hall_id is not None:
                raise ValueError("A training booking needs a trainer and no hall.")
        elif self.hall_id is None or self.trainer_id is not None:
            raise ValueError("A hall booking needs a hall and no trainer.")
        return self


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
    member_name: str | None = None
    member_phone: str | None = None
    member_membership_plan: Literal["monthly", "quarterly", "annual"] | None = None
    member_membership_expires_on: date | None = None
    trainer_name: str | None = None
    hall_name: str | None = None
    payment_status: Literal["approved", "declined", "refunded"] | None = None
    payment_method: Literal["card", "nfc", "app", "cash"] | None = None
    paid_at: datetime | None = None

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
