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


class TrainerProfile(PublicTrainer):
    is_active: bool


class TrainerAvailabilityUpdateRequest(BaseModel):
    state: Literal["available", "break", "off"]
    note: str = Field(default="", max_length=120)
    break_until: datetime | None = None

    @model_validator(mode="after")
    def validate_break_until(self) -> "TrainerAvailabilityUpdateRequest":
        if self.state == "break":
            if self.break_until is None:
                raise ValueError("Break until is required when the trainer is on a break.")
            now = datetime.now(self.break_until.tzinfo) if self.break_until.tzinfo else datetime.now()
            if self.break_until <= now:
                raise ValueError("Break until must be in the future.")
        return self


class TrainerAvailabilityResponse(BaseModel):
    trainer_id: int = Field(gt=0)
    state: Literal["available", "break", "off"]
    note: str
    break_until: datetime | None
    updated_at: datetime | None


class PublicTrainerAvailabilityResponse(BaseModel):
    trainer_id: int = Field(gt=0)
    state: Literal["available", "break", "off"]
    break_until: datetime | None
    updated_at: datetime | None


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
    status: Literal["pending_approval"] = "pending_approval"
    verification_email_sent: bool = True


class CurrentUserResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: Literal["member", "trainer", "receptionist", "admin"]
    member_id: int | None = None
    trainer_id: int | None = None
    trainer_specialization: str | None = None
    trainer_session_price_kzt: float | None = None
    trainer_is_active: bool | None = None
    email_verified: bool = True
    # Only set by sign-up: False when the account was saved but the email could not be sent.
    verification_email_sent: bool | None = None


class VerifyEmailRequest(BaseModel):
    token: str = Field(max_length=200)


class VerifyEmailResponse(BaseModel):
    status: Literal["verified"] = "verified"
    email: str
    already_verified: bool


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


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
    booking_type: Literal["training", "hall_rental", "combined"]
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
        elif self.booking_type == "combined":
            if self.trainer_id is None or self.hall_id is None:
                raise ValueError("A hall + trainer booking needs both a hall and a trainer.")
            on_the_hour = (self.start_time.minute, self.start_time.second, self.end_time.minute, self.end_time.second) == (0, 0, 0, 0)
            if not on_the_hour:
                raise ValueError("A hall + trainer booking must start and end on the hour.")
        elif self.hall_id is None or self.trainer_id is not None:
            raise ValueError("A hall booking needs a hall and no trainer.")
        return self


class BookingResponse(BaseModel):
    booking_id: int
    member_id: int
    booking_type: Literal["training", "hall_rental", "combined"]
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


# ---- Admin -------------------------------------------------------------------

class AdminTrainer(BaseModel):
    trainer_id: int
    full_name: str
    specialization: str
    session_price_kzt: Money
    is_active: bool


class TrainerInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    specialization: str = Field(min_length=2, max_length=60)
    session_price_kzt: Money


class TrainerPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    specialization: str | None = Field(default=None, min_length=2, max_length=60)
    session_price_kzt: Money | None = None
    is_active: bool | None = None


class TrainerApplicationResponse(BaseModel):
    application_id: int  # = trainer_id of the pending trainer
    full_name: str
    email: str
    email_verified: bool
    specialization: str
    session_price_kzt: Money
    created_at: datetime
    review_status: Literal["waiting_email", "checking"]
    review_reasons: list[str]


class AdminHall(BaseModel):
    hall_id: int
    hall_name: str
    capacity: int
    hourly_rate_kzt: Money
    is_active: bool


class HallInput(BaseModel):
    hall_name: str = Field(min_length=1, max_length=60)
    capacity: int = Field(ge=1, le=200)
    hourly_rate_kzt: Money


class HallPatch(BaseModel):
    hall_name: str | None = Field(default=None, min_length=1, max_length=60)
    capacity: int | None = Field(default=None, ge=1, le=200)
    hourly_rate_kzt: Money | None = None
    is_active: bool | None = None


class AdminMemberResponse(MemberResponse):
    bookings: int


class MemberPatch(BaseModel):
    membership_plan: Literal["monthly", "quarterly", "annual"]


class MembershipExtendRequest(BaseModel):
    months: int = Field(ge=1, le=24)


class AdminBookingStatusRequest(BaseModel):
    status: Literal["confirmed", "completed", "no_show", "cancelled"]


class AdminBookingResponse(BookingResponse):
    member_email: str | None = None
    payment: PaymentResponse | None = None


class AdminPaymentResponse(PaymentResponse):
    booking_no: str
    member_name: str


class StaffAccountResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: Literal["trainer", "receptionist", "admin"]
    trainer_id: int | None = None
    is_active: bool


class StaffCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=255)
    role: Literal["receptionist", "trainer"]  # there is exactly one admin; it is never created here
    trainer_id: int | None = Field(default=None, gt=0)
    password: str = Field(min_length=8, max_length=72)


class StaffPatch(BaseModel):
    is_active: bool


class AuditEntry(BaseModel):
    audit_id: int
    actor_user_id: int | None
    actor_email: str | None
    actor_role: str | None
    action: str
    target_type: str | None
    target_id: int | None
    details: dict
    created_at: datetime


class HourCount(BaseModel):
    hour: int
    label: str
    count: int


class WeekdayCount(BaseModel):
    day: str
    count: int


class AdminOverview(BaseModel):
    bookings_week: int
    confirmed_week: int
    pending_week: int
    revenue_30d: float
    no_show_rate: float
    busiest_day: str
    busiest_hour: str
    by_weekday: list[WeekdayCount]
    by_hour: list[HourCount]


class AdminAttention(BaseModel):
    pendingTrainers: int
    unpaidBookings: int
    expiringMemberships: int
    expiredMemberships: int


class ResourceCounts(BaseModel):
    trainers: dict[int, int]
    halls: dict[int, int]
    booked: dict[str, dict[int, int]]


class TrainerReportRow(BaseModel):
    trainer_id: int
    trainer_name: str
    sessions: int
    evening: int
    before_17: int
    no_shows: int


# ---- group sessions ----------------------------------------------------------------

GroupStatus = Literal["invited", "accepted", "declined", "left", "removed"]


class GroupInviteRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class GroupParticipant(BaseModel):
    member_id: int
    full_name: str
    # Only the owner and staff see emails; other guests and the trainer see names.
    email: str | None = None
    status: GroupStatus
    invited_at: datetime
    responded_at: datetime | None = None


class GroupDetails(BaseModel):
    booking_id: int
    owner_member_id: int
    owner_name: str
    max_size: int
    # Owner + accepted guests.
    size: int
    participants: list[GroupParticipant]


class GroupInvitation(BaseModel):
    """A group session the signed-in member was invited to or joined."""

    booking_id: int
    status: GroupStatus
    invited_at: datetime
    owner_name: str
    booking_type: Literal["training", "hall_rental", "combined"]
    booking_status: str
    trainer_name: str | None = None
    hall_name: str | None = None
    start_time: datetime
    end_time: datetime
    size: int
