"""Admin API: everything the single admin account manages.

Every route needs a signed-in user with role 'admin' (see require_roles). Each change is
written to audit_log in the same transaction as the change itself.
"""

import logging
from datetime import date
from typing import Annotated, Literal

import psycopg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row

from .audit import record
from .auth import check_new_password, hash_password
from .bookings import database_error
from .db import connect, is_valid_email
from .trainer_notifications import load_session_notice, send_trainer_cancellation_email
from .models import (
    AdminAttention,
    AdminBookingResponse,
    AdminBookingStatusRequest,
    AdminHall,
    AdminMemberResponse,
    AdminOverview,
    AdminPaymentResponse,
    AdminTrainer,
    AuditEntry,
    CurrentUserResponse,
    HallInput,
    HallPatch,
    HourCount,
    MemberPatch,
    MembershipExtendRequest,
    ResourceCounts,
    StaffAccountResponse,
    StaffCreateRequest,
    StaffPatch,
    TrainerApplicationResponse,
    TrainerInput,
    TrainerPatch,
    TrainerReportRow,
    WeekdayCount,
)
from .security import require_roles


router = APIRouter(prefix="/admin", tags=["Admin"])
logger = logging.getLogger(__name__)

Admin = Annotated[CurrentUserResponse, Depends(require_roles("admin"))]
Id = Annotated[int, Path(gt=0)]

OPEN_HOUR, CLOSE_HOUR = 7, 22
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# A trainer who signed up and is still waiting: never approved, inactive, and has a trainer login.
PENDING_TRAINER = """
    t.approved_at IS NULL
    AND t.is_active = FALSE
    AND EXISTS (SELECT 1 FROM users pu WHERE pu.trainer_id = t.trainer_id AND pu.role = 'trainer')
"""

# What an admin may change a booking status to, by current status. Payments decide
# pending -> confirmed, and the hold timer decides pending -> expired, so those stay automatic.
STATUS_CHANGES: dict[str, set[str]] = {
    "pending": {"cancelled"},
    "confirmed": {"completed", "no_show", "cancelled"},
    "completed": {"no_show", "confirmed"},
    "no_show": {"completed", "confirmed"},
    "cancelled": set(),
    "expired": set(),
}


def unavailable(action: str) -> HTTPException:
    logger.exception("Admin %s failed", action)
    return HTTPException(status_code=503, detail="The admin service is temporarily unavailable. Check the backend log.")


def audit(cursor: psycopg.Cursor, admin: CurrentUserResponse, action: str, target_type: str, target_id: int | None, **details) -> None:
    record(
        cursor,
        action,
        actor_user_id=admin.user_id,
        actor_email=admin.email,
        actor_role=admin.role,
        target_type=target_type,
        target_id=target_id,
        details={key: value for key, value in details.items() if value is not None},
    )


def clean(text: str) -> str:
    return " ".join(text.split())


HALL_NAME = (1, "Please enter the hall name.")
FULL_NAME = (2, "Please enter your full name.")  # same rule and message as sign-up (auth.py)
SPECIALIZATION = (2, "Please enter your specialization.")


def required(text: str, rule: tuple[int, str]) -> str:
    """Collapse spaces, then check the length again: "   " passes min_length but is empty once cleaned."""
    minimum, message = rule
    cleaned = clean(text)
    if len(cleaned) < minimum:
        raise HTTPException(status_code=422, detail=message)
    return cleaned


def jsonable(value):
    """Decimals and dates in audit details."""
    if isinstance(value, date):
        return value.isoformat()
    if hasattr(value, "is_finite"):
        return float(value)
    return value


# ---- trainers ------------------------------------------------------------------

TRAINER_COLUMNS = "trainer_id, full_name, specialization, session_price_kzt, is_active"


@router.get("/trainers", response_model=list[AdminTrainer])
def list_trainers(_: Admin) -> list[AdminTrainer]:
    """Every trainer, active or not. Sign-ups waiting for approval are listed under /admin/trainer-applications."""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                f"SELECT {TRAINER_COLUMNS} FROM trainers t WHERE NOT ({PENDING_TRAINER}) ORDER BY trainer_id"
            ).fetchall()
    except psycopg.Error:
        raise unavailable("list trainers") from None
    return [AdminTrainer(**row) for row in rows]


@router.post("/trainers", response_model=AdminTrainer, status_code=201)
def create_trainer(input: TrainerInput, admin: Admin) -> AdminTrainer:
    full_name = required(input.full_name, FULL_NAME)
    specialization = required(input.specialization, SPECIALIZATION)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO trainers (full_name, specialization, session_price_kzt, is_active, approved_at)
                    VALUES (%s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                    RETURNING {TRAINER_COLUMNS}
                    """,
                    (full_name, specialization, input.session_price_kzt),
                )
                row = cursor.fetchone()
                audit(cursor, admin, "trainer.created", "trainer", row["trainer_id"], full_name=row["full_name"])
    except psycopg.Error:
        raise unavailable("create trainer") from None
    return AdminTrainer(**row)


@router.patch("/trainers/{trainer_id}", response_model=AdminTrainer)
def update_trainer(trainer_id: Id, input: TrainerPatch, admin: Admin) -> AdminTrainer:
    """Edit and/or (de)activate. Price changes only affect new bookings; old ones keep their price."""
    changes = input.model_dump(exclude_none=True)
    if "full_name" in changes:
        changes["full_name"] = required(changes["full_name"], FULL_NAME)
    if "specialization" in changes:
        changes["specialization"] = required(changes["specialization"], SPECIALIZATION)
    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to change.")

    assignments = [f"{column} = %s" for column in changes]
    if changes.get("is_active"):
        # Activating a trainer also counts as approving them.
        assignments.append("approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)")
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE trainers SET {', '.join(assignments)} WHERE trainer_id = %s RETURNING {TRAINER_COLUMNS}",
                    (*changes.values(), trainer_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Trainer not found.")
                action = (
                    "trainer.activated" if changes.keys() == {"is_active"} and changes["is_active"]
                    else "trainer.deactivated" if changes.keys() == {"is_active"}
                    else "trainer.updated"
                )
                audit(cursor, admin, action, "trainer", trainer_id,
                      full_name=row["full_name"], changes={k: jsonable(v) for k, v in changes.items()})
    except psycopg.Error:
        raise unavailable("update trainer") from None
    return AdminTrainer(**row)


def _delete_trainer(cursor: psycopg.Cursor, trainer_id: int) -> None:
    cursor.execute("SELECT COUNT(*) AS n FROM bookings WHERE trainer_id = %s", (trainer_id,))
    if cursor.fetchone()["n"]:
        raise HTTPException(status_code=409, detail="This trainer has bookings, so it can only be deactivated.")
    # Sessions, verification and reset tokens go with the login (ON DELETE CASCADE).
    cursor.execute("DELETE FROM users WHERE trainer_id = %s", (trainer_id,))
    cursor.execute("DELETE FROM trainers WHERE trainer_id = %s", (trainer_id,))


@router.delete("/trainers/{trainer_id}", status_code=204)
def delete_trainer(trainer_id: Id, admin: Admin) -> None:
    """Only for a trainer that was never booked; otherwise deactivate, so reports stay correct."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT full_name FROM trainers WHERE trainer_id = %s FOR UPDATE", (trainer_id,))
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Trainer not found.")
                _delete_trainer(cursor, trainer_id)
                audit(cursor, admin, "trainer.deleted", "trainer", trainer_id, full_name=row["full_name"])
    except psycopg.Error:
        raise unavailable("delete trainer") from None


# ---- trainer applications (replaces the manual UPDATE in pgAdmin) --------------

@router.get("/trainer-applications", response_model=list[TrainerApplicationResponse])
def list_applications(_: Admin) -> list[TrainerApplicationResponse]:
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                f"""
                SELECT t.trainer_id AS application_id, t.full_name, u.email, u.email_verified,
                       t.specialization, t.session_price_kzt, u.created_at
                FROM trainers t
                JOIN users u ON u.trainer_id = t.trainer_id AND u.role = 'trainer'
                WHERE {PENDING_TRAINER}
                ORDER BY u.created_at DESC, t.trainer_id DESC
                """
            ).fetchall()
    except psycopg.Error:
        raise unavailable("list trainer applications") from None
    return [TrainerApplicationResponse(**row) for row in rows]


@router.post("/trainer-applications/{trainer_id}/approve", response_model=AdminTrainer)
def approve_application(trainer_id: Id, admin: Admin) -> AdminTrainer:
    """The trainer becomes active: visible in the catalogue and bookable."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE trainers t
                    SET is_active = TRUE, approved_at = CURRENT_TIMESTAMP
                    WHERE t.trainer_id = %s AND {PENDING_TRAINER}
                    RETURNING {TRAINER_COLUMNS}
                    """,
                    (trainer_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Application not found.")
                audit(cursor, admin, "trainer.approved", "trainer", trainer_id, full_name=row["full_name"])
    except psycopg.Error:
        raise unavailable("approve trainer") from None
    return AdminTrainer(**row)


@router.post("/trainer-applications/{trainer_id}/reject", status_code=204)
def reject_application(trainer_id: Id, admin: Admin) -> None:
    """Removes the sign-up: the trainer row and its login. The email can be used to sign up again."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT t.full_name, (SELECT email FROM users WHERE trainer_id = t.trainer_id LIMIT 1) AS email
                    FROM trainers t
                    WHERE t.trainer_id = %s AND {PENDING_TRAINER}
                    FOR UPDATE
                    """,
                    (trainer_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Application not found.")
                _delete_trainer(cursor, trainer_id)
                audit(cursor, admin, "trainer.rejected", "trainer", trainer_id, full_name=row["full_name"], email=row["email"])
    except psycopg.Error:
        raise unavailable("reject trainer") from None


# ---- halls ---------------------------------------------------------------------

HALL_COLUMNS = "hall_id, hall_name, capacity, hourly_rate_kzt, is_active"
HALL_TAKEN = HTTPException(status_code=409, detail="A hall with this name already exists.")


@router.get("/halls", response_model=list[AdminHall])
def list_halls(_: Admin) -> list[AdminHall]:
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(f"SELECT {HALL_COLUMNS} FROM halls ORDER BY hall_id").fetchall()
    except psycopg.Error:
        raise unavailable("list halls") from None
    return [AdminHall(**row) for row in rows]


@router.post("/halls", response_model=AdminHall, status_code=201)
def create_hall(input: HallInput, admin: Admin) -> AdminHall:
    hall_name = required(input.hall_name, HALL_NAME)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO halls (hall_name, capacity, hourly_rate_kzt)
                    VALUES (%s, %s, %s)
                    RETURNING {HALL_COLUMNS}
                    """,
                    (hall_name, input.capacity, input.hourly_rate_kzt),
                )
                row = cursor.fetchone()
                audit(cursor, admin, "hall.created", "hall", row["hall_id"], hall_name=row["hall_name"])
    except UniqueViolation:
        raise HALL_TAKEN from None
    except psycopg.Error:
        raise unavailable("create hall") from None
    return AdminHall(**row)


@router.patch("/halls/{hall_id}", response_model=AdminHall)
def update_hall(hall_id: Id, input: HallPatch, admin: Admin) -> AdminHall:
    changes = input.model_dump(exclude_none=True)
    if "hall_name" in changes:
        changes["hall_name"] = required(changes["hall_name"], HALL_NAME)
    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to change.")
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE halls SET {', '.join(f'{c} = %s' for c in changes)} WHERE hall_id = %s RETURNING {HALL_COLUMNS}",
                    (*changes.values(), hall_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Hall not found.")
                action = (
                    "hall.activated" if changes.keys() == {"is_active"} and changes["is_active"]
                    else "hall.deactivated" if changes.keys() == {"is_active"}
                    else "hall.updated"
                )
                audit(cursor, admin, action, "hall", hall_id,
                      hall_name=row["hall_name"], changes={k: jsonable(v) for k, v in changes.items()})
    except UniqueViolation:
        raise HALL_TAKEN from None
    except psycopg.Error:
        raise unavailable("update hall") from None
    return AdminHall(**row)


@router.delete("/halls/{hall_id}", status_code=204)
def delete_hall(hall_id: Id, admin: Admin) -> None:
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT hall_name FROM halls WHERE hall_id = %s FOR UPDATE", (hall_id,))
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Hall not found.")
                cursor.execute("SELECT COUNT(*) AS n FROM bookings WHERE hall_id = %s", (hall_id,))
                if cursor.fetchone()["n"]:
                    raise HTTPException(status_code=409, detail="This hall has bookings, so it can only be deactivated.")
                cursor.execute("DELETE FROM halls WHERE hall_id = %s", (hall_id,))
                audit(cursor, admin, "hall.deleted", "hall", hall_id, hall_name=row["hall_name"])
    except psycopg.Error:
        raise unavailable("delete hall") from None


@router.get("/resource-counts", response_model=ResourceCounts)
def resource_counts(_: Admin) -> ResourceCounts:
    """Held sessions per trainer / hall, and all bookings per trainer / hall (none = may be deleted)."""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                """
                SELECT trainer_id, hall_id,
                       COUNT(*) AS booked,
                       COUNT(*) FILTER (WHERE status IN ('completed', 'no_show')) AS held
                FROM bookings
                GROUP BY trainer_id, hall_id
                """
            ).fetchall()
    except psycopg.Error:
        raise unavailable("count sessions") from None
    out = ResourceCounts(trainers={}, halls={}, booked={"trainers": {}, "halls": {}})
    for row in rows:
        kind, key = ("trainers", row["trainer_id"]) if row["trainer_id"] is not None else ("halls", row["hall_id"])
        out.booked[kind][key] = row["booked"]
        if row["held"]:
            getattr(out, kind)[key] = row["held"]
    return out


# ---- members -------------------------------------------------------------------

MEMBER_COLUMNS = """
    m.member_id, m.full_name, m.email, m.phone, m.qr_code_token, m.membership_plan,
    m.membership_expires_on, m.created_at,
    (SELECT COUNT(*) FROM bookings b WHERE b.member_id = m.member_id) AS bookings
"""


def _member(cursor: psycopg.Cursor, member_id: int) -> AdminMemberResponse:
    cursor.execute(f"SELECT {MEMBER_COLUMNS} FROM members m WHERE m.member_id = %s", (member_id,))
    return AdminMemberResponse(**cursor.fetchone())


@router.get("/members", response_model=list[AdminMemberResponse])
def list_members(_: Admin, q: str = Query(default="", max_length=100)) -> list[AdminMemberResponse]:
    """Full member records (email and QR token included), searchable by name, email or phone."""
    needle = q.strip().lower()
    digits = "".join(ch for ch in needle if ch.isdigit())
    query = f"SELECT {MEMBER_COLUMNS} FROM members m"
    params: list[str] = []
    if needle:
        query += " WHERE LOWER(m.full_name) LIKE %s OR LOWER(m.email) LIKE %s"
        params += [f"%{needle}%", f"%{needle}%"]
        if len(digits) >= 3:
            query += " OR regexp_replace(m.phone, '[^0-9]', '', 'g') LIKE %s"
            params.append(f"%{digits}%")
    query += " ORDER BY m.full_name, m.member_id"
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(query, params).fetchall()
    except psycopg.Error:
        raise unavailable("list members") from None
    return [AdminMemberResponse(**row) for row in rows]


@router.patch("/members/{member_id}", response_model=AdminMemberResponse)
def update_member_plan(member_id: Id, input: MemberPatch, admin: Admin) -> AdminMemberResponse:
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE members SET membership_plan = %s WHERE member_id = %s RETURNING full_name",
                    (input.membership_plan, member_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Member not found.")
                audit(cursor, admin, "member.plan_changed", "member", member_id,
                      full_name=row["full_name"], membership_plan=input.membership_plan)
                return _member(cursor, member_id)
    except psycopg.Error:
        raise unavailable("update member") from None


@router.post("/members/{member_id}/extend", response_model=AdminMemberResponse)
def extend_membership(member_id: Id, input: MembershipExtendRequest, admin: Admin) -> AdminMemberResponse:
    """Adds N months from the later of today and the current end date."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE members
                    SET membership_expires_on =
                        (GREATEST(membership_expires_on, CURRENT_DATE) + make_interval(months => %s))::date
                    WHERE member_id = %s
                    RETURNING full_name, membership_expires_on
                    """,
                    (input.months, member_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Member not found.")
                audit(cursor, admin, "member.membership_extended", "member", member_id,
                      full_name=row["full_name"], months=input.months,
                      expires_on=row["membership_expires_on"].isoformat())
                return _member(cursor, member_id)
    except psycopg.Error:
        raise unavailable("extend membership") from None


# ---- bookings ------------------------------------------------------------------

ADMIN_BOOKING_QUERY = """
    SELECT
        b.booking_id, b.member_id, b.booking_type, b.trainer_id, b.hall_id,
        b.start_time, b.end_time, b.status, b.price_kzt, b.created_at, b.payment_expires_at,
        m.full_name AS member_name, m.phone AS member_phone, m.email AS member_email,
        m.membership_plan AS member_membership_plan,
        m.membership_expires_on AS member_membership_expires_on,
        t.full_name AS trainer_name, h.hall_name AS hall_name,
        p.payment_id, p.amount_kzt, p.method AS payment_method, p.payment_status,
        p.provider_txn_ref, p.created_at AS payment_created_at,
        CASE WHEN p.payment_status IN ('approved', 'refunded') THEN p.created_at END AS paid_at
    FROM bookings b
    JOIN members m ON m.member_id = b.member_id
    LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
    LEFT JOIN halls h ON h.hall_id = b.hall_id
    LEFT JOIN LATERAL (
        SELECT * FROM payments
        WHERE booking_id = b.booking_id
        ORDER BY created_at DESC, payment_id DESC
        LIMIT 1
    ) AS p ON TRUE
"""


def _admin_booking(row: dict) -> AdminBookingResponse:
    payment = None
    if row["payment_id"] is not None:
        payment = {
            "payment_id": row["payment_id"],
            "booking_id": row["booking_id"],
            "amount_kzt": row["amount_kzt"],
            "method": row["payment_method"],
            "payment_status": row["payment_status"],
            "provider_txn_ref": row["provider_txn_ref"],
            "created_at": row["payment_created_at"],
        }
    return AdminBookingResponse(**row, payment=payment)


@router.get("/bookings", response_model=list[AdminBookingResponse])
def list_bookings(_: Admin) -> list[AdminBookingResponse]:
    """All bookings with member contact data and the latest payment attempt."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                cursor.execute(ADMIN_BOOKING_QUERY + " ORDER BY b.start_time DESC, b.booking_id DESC")
                rows = cursor.fetchall()
    except psycopg.Error:
        raise unavailable("list bookings") from None
    return [_admin_booking(row) for row in rows]


@router.post("/bookings/{booking_id}/status", response_model=AdminBookingResponse)
def change_booking_status(
    booking_id: Id, input: AdminBookingStatusRequest, admin: Admin, background: BackgroundTasks
) -> AdminBookingResponse:
    """Admin override: cancel, mark attendance, or correct an attendance mistake."""
    trainer_notice = None
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                cursor.execute(
                    "SELECT status, start_time <= LOCALTIMESTAMP AS started FROM bookings WHERE booking_id = %s FOR UPDATE",
                    (booking_id,),
                )
                current = cursor.fetchone()
                if current is None:
                    raise HTTPException(status_code=404, detail="Booking not found.")
                old, new = current["status"], input.status
                if old != new:
                    if new not in STATUS_CHANGES[old]:
                        raise HTTPException(status_code=409, detail=f"A {old.replace('_', '-')} booking cannot be changed to {new.replace('_', '-')}.")
                    if new in {"completed", "no_show"} and not current["started"]:
                        raise HTTPException(status_code=409, detail="Attendance can only be marked once the session has started.")
                    cursor.execute("UPDATE bookings SET status = %s WHERE booking_id = %s", (new, booking_id))
                    if new == "cancelled" and old == "confirmed":
                        cursor.execute(
                            "UPDATE payments SET payment_status = 'refunded' WHERE booking_id = %s AND payment_status = 'approved'",
                            (booking_id,),
                        )
                        trainer_notice = load_session_notice(cursor, booking_id)
                    audit(cursor, admin, "booking.status_changed", "booking", booking_id, **{"from": old, "to": new})
                cursor.execute(ADMIN_BOOKING_QUERY + " WHERE b.booking_id = %s", (booking_id,))
                result = _admin_booking(cursor.fetchone())
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None
    # Queued only after the transaction committed; sent after the response.
    if trainer_notice is not None:
        background.add_task(send_trainer_cancellation_email, trainer_notice)
    return result


# ---- payments ------------------------------------------------------------------

@router.get("/payments", response_model=list[AdminPaymentResponse])
def list_payments(
    _: Admin,
    status: Literal["approved", "declined", "refunded"] | None = None,
    method: Literal["card", "nfc", "app", "cash"] | None = None,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    q: str = Query(default="", max_length=100),
) -> list[AdminPaymentResponse]:
    conditions, params = [], []
    if status:
        conditions.append("p.payment_status = %s")
        params.append(status)
    if method:
        conditions.append("p.method = %s")
        params.append(method)
    if date_from:
        conditions.append("p.created_at::date >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("p.created_at::date <= %s")
        params.append(date_to)
    needle = q.strip().lower()
    if needle:
        conditions.append(
            "(LOWER(p.provider_txn_ref) LIKE %s OR LOWER('bk-' || LPAD(b.booking_id::text, 4, '0')) LIKE %s OR LOWER(m.full_name) LIKE %s)"
        )
        params += [f"%{needle}%"] * 3
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                f"""
                SELECT p.payment_id, p.booking_id, p.amount_kzt, p.method, p.payment_status,
                       p.provider_txn_ref, p.created_at,
                       'BK-' || LPAD(b.booking_id::text, 4, '0') AS booking_no,
                       m.full_name AS member_name
                FROM payments p
                JOIN bookings b ON b.booking_id = p.booking_id
                JOIN members m ON m.member_id = b.member_id
                {where}
                ORDER BY p.created_at DESC, p.payment_id DESC
                """,
                params,
            ).fetchall()
    except psycopg.Error:
        raise unavailable("list payments") from None
    return [AdminPaymentResponse(**row) for row in rows]


# ---- overview and reports ------------------------------------------------------

def _hours(rows: list[dict]) -> list[HourCount]:
    counts = {int(row["hour"]): row["n"] for row in rows}
    return [HourCount(hour=h, label=f"{h:02d}:00", count=counts.get(h, 0)) for h in range(OPEN_HOUR, CLOSE_HOUR)]


@router.get("/overview", response_model=AdminOverview)
def overview(_: Admin) -> AdminOverview:
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                week = cursor.execute(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'expired')) AS bookings_week,
                        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_week,
                        COUNT(*) FILTER (WHERE status = 'pending') AS pending_week
                    FROM bookings
                    WHERE start_time >= date_trunc('week', CURRENT_DATE)
                      AND start_time < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
                    """
                ).fetchone()
                revenue = cursor.execute(
                    """
                    SELECT COALESCE(SUM(amount_kzt), 0) AS revenue
                    FROM payments
                    WHERE payment_status = 'approved'
                      AND created_at::date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
                    """
                ).fetchone()["revenue"]
                attended = cursor.execute(
                    """
                    SELECT COUNT(*) AS held, COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
                    FROM bookings WHERE status IN ('completed', 'no_show')
                    """
                ).fetchone()
                weekdays = cursor.execute(
                    """
                    SELECT EXTRACT(ISODOW FROM start_time)::int - 1 AS day, COUNT(*) AS n
                    FROM bookings WHERE status IN ('confirmed', 'completed', 'no_show')
                    GROUP BY 1
                    """
                ).fetchall()
                hours = cursor.execute(
                    """
                    SELECT EXTRACT(HOUR FROM start_time)::int AS hour, COUNT(*) AS n
                    FROM bookings WHERE status IN ('confirmed', 'completed', 'no_show')
                    GROUP BY 1
                    """
                ).fetchall()
    except psycopg.Error:
        raise unavailable("overview") from None

    day_counts = {row["day"]: row["n"] for row in weekdays}
    by_weekday = [WeekdayCount(day=name, count=day_counts.get(i, 0)) for i, name in enumerate(WEEKDAYS)]
    by_hour = _hours(hours)
    top_day = max(by_weekday, key=lambda x: x.count)
    top_hour = max(by_hour, key=lambda x: x.count)
    return AdminOverview(
        **week,
        revenue_30d=float(revenue),
        no_show_rate=attended["no_shows"] / attended["held"] if attended["held"] else 0.0,
        busiest_day=top_day.day if top_day.count else "-",
        busiest_hour=top_hour.label if top_hour.count else "-",
        by_weekday=by_weekday,
        by_hour=by_hour,
    )


@router.get("/attention", response_model=AdminAttention)
def attention(_: Admin) -> AdminAttention:
    """The to-do list on the overview page."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                row = cursor.execute(
                    f"""
                    SELECT
                        (SELECT COUNT(*) FROM trainers t WHERE {PENDING_TRAINER}) AS "pendingTrainers",
                        (SELECT COUNT(*) FROM bookings WHERE status = 'pending' AND start_time::date >= CURRENT_DATE) AS "unpaidBookings",
                        (SELECT COUNT(*) FROM members WHERE membership_expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS "expiringMemberships",
                        (SELECT COUNT(*) FROM members WHERE membership_expires_on < CURRENT_DATE) AS "expiredMemberships"
                    """
                ).fetchone()
    except psycopg.Error:
        raise unavailable("attention list") from None
    return AdminAttention(**row)


@router.get("/reports/trainers", response_model=list[TrainerReportRow])
def popular_trainers(_: Admin, date_from: date = Query(alias="from"), date_to: date = Query(alias="to")) -> list[TrainerReportRow]:
    """Sessions that took place (completed or no-show) per trainer in the date range."""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                """
                SELECT t.trainer_id, t.full_name AS trainer_name,
                       COUNT(*) AS sessions,
                       COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM b.start_time) >= 17) AS evening,
                       COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM b.start_time) < 17) AS before_17,
                       COUNT(*) FILTER (WHERE b.status = 'no_show') AS no_shows
                FROM bookings b
                JOIN trainers t ON t.trainer_id = b.trainer_id
                WHERE b.status IN ('completed', 'no_show')
                  AND b.start_time::date BETWEEN %s AND %s
                GROUP BY t.trainer_id, t.full_name
                ORDER BY sessions DESC, t.full_name
                """,
                (date_from, date_to),
            ).fetchall()
    except psycopg.Error:
        raise unavailable("trainer report") from None
    return [TrainerReportRow(**row) for row in rows]


@router.get("/reports/hours", response_model=list[HourCount])
def popular_hours(_: Admin, date_from: date = Query(alias="from"), date_to: date = Query(alias="to")) -> list[HourCount]:
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                """
                SELECT EXTRACT(HOUR FROM start_time)::int AS hour, COUNT(*) AS n
                FROM bookings
                WHERE status IN ('confirmed', 'completed', 'no_show')
                  AND start_time::date BETWEEN %s AND %s
                GROUP BY 1
                """,
                (date_from, date_to),
            ).fetchall()
    except psycopg.Error:
        raise unavailable("hours report") from None
    return _hours(rows)


# ---- staff accounts ------------------------------------------------------------

STAFF_QUERY = """
    SELECT u.user_id, u.email, u.role, u.trainer_id, u.is_active,
           COALESCE(t.full_name, u.full_name, INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' '))) AS full_name
    FROM users u
    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
    WHERE u.role <> 'member'
"""


@router.get("/staff", response_model=list[StaffAccountResponse])
def list_staff(_: Admin) -> list[StaffAccountResponse]:
    """Admin, receptionist and trainer logins. Passwords never leave the database."""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                STAFF_QUERY + " ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'receptionist' THEN 1 ELSE 2 END, full_name"
            ).fetchall()
    except psycopg.Error:
        raise unavailable("list staff") from None
    return [StaffAccountResponse(**row) for row in rows]


@router.post("/staff", response_model=StaffAccountResponse, status_code=201)
def create_staff(input: StaffCreateRequest, admin: Admin) -> StaffAccountResponse:
    """Creates a receptionist login, or a login for an existing trainer profile. The admin sets the first password."""
    email = input.email.strip().lower()
    full_name = required(input.full_name, FULL_NAME)
    if not is_valid_email(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email.")
    if input.role == "trainer" and input.trainer_id is None:
        raise HTTPException(status_code=422, detail="Choose which trainer profile this login belongs to.")
    check_new_password(input.password)
    trainer_id = input.trainer_id if input.role == "trainer" else None
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                if trainer_id is not None:
                    cursor.execute("SELECT 1 FROM trainers WHERE trainer_id = %s", (trainer_id,))
                    if cursor.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Trainer not found.")
                # Staff accounts are made by the admin, so the email counts as verified.
                cursor.execute(
                    """
                    INSERT INTO users (email, password_hash, role, trainer_id, full_name, email_verified, email_verified_at)
                    VALUES (%s, %s, %s, %s, %s, TRUE, CURRENT_TIMESTAMP)
                    RETURNING user_id
                    """,
                    (email, hash_password(input.password), input.role, trainer_id, full_name),
                )
                user_id = cursor.fetchone()["user_id"]
                audit(cursor, admin, "staff.created", "user", user_id, email=email, role=input.role, trainer_id=trainer_id)
                cursor.execute(STAFF_QUERY + " AND u.user_id = %s", (user_id,))
                row = cursor.fetchone()
    except UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists, or this trainer already has a login.",
        ) from None
    except psycopg.Error:
        raise unavailable("create staff") from None
    return StaffAccountResponse(**row)


@router.patch("/staff/{user_id}", response_model=StaffAccountResponse)
def update_staff(user_id: Id, input: StaffPatch, admin: Admin) -> StaffAccountResponse:
    if user_id == admin.user_id:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own account.")
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET is_active = %s WHERE user_id = %s AND role IN ('receptionist', 'trainer') RETURNING email, role",
                    (input.is_active, user_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Account not found.")
                if not input.is_active:
                    # Sign them out everywhere right away.
                    cursor.execute("DELETE FROM user_sessions WHERE user_id = %s", (user_id,))
                audit(cursor, admin, "staff.activated" if input.is_active else "staff.deactivated", "user", user_id,
                      email=row["email"], role=row["role"])
                cursor.execute(STAFF_QUERY + " AND u.user_id = %s", (user_id,))
                staff = cursor.fetchone()
    except psycopg.Error:
        raise unavailable("update staff") from None
    return StaffAccountResponse(**staff)


# ---- audit log -----------------------------------------------------------------

@router.get("/audit", response_model=list[AuditEntry])
def list_audit(
    _: Admin,
    action: str = Query(default="", max_length=60),
    q: str = Query(default="", max_length=100),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[AuditEntry]:
    """Newest first. `action` matches a prefix (for example "trainer." for every trainer event)."""
    conditions, params = [], []
    if action:
        conditions.append("action LIKE %s")
        params.append(f"{action}%")
    needle = q.strip().lower()
    if needle:
        conditions.append("(LOWER(COALESCE(actor_email, '')) LIKE %s OR LOWER(details::text) LIKE %s)")
        params += [f"%{needle}%", f"%{needle}%"]
    if date_from:
        conditions.append("created_at::date >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("created_at::date <= %s")
        params.append(date_to)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    try:
        with connect(row_factory=dict_row) as connection:
            rows = connection.execute(
                f"""
                SELECT audit_id, actor_user_id, actor_email, actor_role, action, target_type, target_id, details, created_at
                FROM audit_log {where}
                ORDER BY created_at DESC, audit_id DESC
                LIMIT %s
                """,
                (*params, limit),
            ).fetchall()
    except psycopg.Error:
        raise unavailable("audit log") from None
    return [AuditEntry(**row) for row in rows]
