"""Group sessions: the member who booked invites other members to join for free.

The booking stays one row with one owner, who pays the normal price. Guests are rows in
booking_participants (see sql/group_sessions.sql). A group is the owner plus up to
GROUP_MAX_SIZE - 1 guests; pending invitations count towards that limit, so an accepted
invitation always fits.

Guests are found by the email of their member login, so no member list is ever shown.
"""

import html
import logging
from datetime import datetime

import psycopg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg.rows import dict_row

from .bookings import database_error
from .db import connect, is_valid_email
from .mailer import OutgoingEmail, send_email
from .models import (
    CurrentUserResponse,
    GroupDetails,
    GroupInvitation,
    GroupInviteRequest,
    GroupParticipant,
)
from .security import current_user
from .trainer_notifications import session_when
from .verification import app_url, ensure_email_verified


GROUP_MAX_SIZE = 5  # the owner + 4 guests
OPEN_SEATS = ("invited", "accepted")  # statuses that take a seat in the group
ACTIVE_BOOKING = ("pending", "confirmed")

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Group sessions"])


def _require_member(user: CurrentUserResponse) -> int:
    if user.role != "member" or user.member_id is None:
        raise HTTPException(status_code=403, detail="Only members can use group sessions.")
    return user.member_id


def _lock_booking(cursor, booking_id: int) -> dict:
    cursor.execute("SELECT expire_pending_bookings()")
    cursor.execute(
        """
        SELECT booking_id, member_id, trainer_id, booking_type, status, start_time, end_time,
               start_time <= LOCALTIMESTAMP AS started
        FROM bookings
        WHERE booking_id = %s
        FOR UPDATE
        """,
        (booking_id,),
    )
    booking = cursor.fetchone()
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return booking


def _ensure_open(booking: dict) -> None:
    if booking["status"] not in ACTIVE_BOOKING or booking["started"]:
        raise HTTPException(status_code=409, detail="This session can no longer be changed.")


def _seats_taken(cursor, booking_id: int) -> int:
    cursor.execute(
        "SELECT COUNT(*) AS n FROM booking_participants WHERE booking_id = %s AND status IN ('invited', 'accepted')",
        (booking_id,),
    )
    return cursor.fetchone()["n"]


def _load_group(cursor, booking_id: int, show_emails: bool) -> GroupDetails:
    cursor.execute(
        """
        SELECT b.booking_id, b.member_id AS owner_member_id, m.full_name AS owner_name
        FROM bookings b
        JOIN members m ON m.member_id = b.member_id
        WHERE b.booking_id = %s
        """,
        (booking_id,),
    )
    head = cursor.fetchone()
    if head is None:
        raise HTTPException(status_code=404, detail="Booking not found.")
    cursor.execute(
        """
        SELECT p.member_id, m.full_name, u.email, p.status, p.invited_at, p.responded_at
        FROM booking_participants p
        JOIN members m ON m.member_id = p.member_id
        LEFT JOIN users u ON u.member_id = p.member_id
        WHERE p.booking_id = %s
        ORDER BY p.invited_at, p.member_id
        """,
        (booking_id,),
    )
    participants = [
        GroupParticipant(**{**row, "email": row["email"] if show_emails else None})
        for row in cursor.fetchall()
    ]
    accepted = sum(1 for p in participants if p.status == "accepted")
    return GroupDetails(
        **head,
        max_size=GROUP_MAX_SIZE,
        size=1 + accepted,
        participants=participants,
    )


@router.get("/bookings/{booking_id}/group", response_model=GroupDetails)
def get_group(booking_id: int, user: CurrentUserResponse = Depends(current_user)) -> GroupDetails:
    """The owner, staff, the booking's trainer and accepted guests can see who is in the group."""
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT b.member_id, b.trainer_id,
                           EXISTS (
                               SELECT 1 FROM booking_participants
                               WHERE booking_id = b.booking_id AND member_id = %s AND status = 'accepted'
                           ) AS is_guest
                    FROM bookings b
                    WHERE b.booking_id = %s
                    """,
                    (user.member_id or -1, booking_id),
                )
                booking = cursor.fetchone()
                if booking is None:
                    raise HTTPException(status_code=404, detail="Booking not found.")
                is_owner = user.role == "member" and user.member_id == booking["member_id"]
                allowed = (
                    is_owner
                    or user.role in {"admin", "receptionist"}
                    or user.role == "member" and booking["is_guest"]
                    or user.role == "trainer" and user.trainer_id is not None and user.trainer_id == booking["trainer_id"]
                )
                if not allowed:
                    raise HTTPException(status_code=403, detail="You are not allowed to access this booking.")
                return _load_group(cursor, booking_id, show_emails=is_owner or user.role in {"admin", "receptionist"})
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/bookings/{booking_id}/group", response_model=GroupDetails, status_code=201)
def invite_member(
    booking_id: int,
    input: GroupInviteRequest,
    background: BackgroundTasks,
    user: CurrentUserResponse = Depends(current_user),
) -> GroupDetails:
    """The owner invites another member by the email of their account."""
    owner_id = _require_member(user)
    email = input.email.strip()
    if not is_valid_email(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    ensure_email_verified(member_id=owner_id)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                booking = _lock_booking(cursor, booking_id)
                if booking["member_id"] != owner_id:
                    raise HTTPException(status_code=403, detail="Only the member who booked can invite people.")
                _ensure_open(booking)

                cursor.execute(
                    """
                    SELECT m.member_id, m.full_name, u.email
                    FROM users u
                    JOIN members m ON m.member_id = u.member_id
                    WHERE LOWER(u.email) = LOWER(%s)
                      AND u.role = 'member'
                      AND u.is_active = TRUE
                    """,
                    (email,),
                )
                guest = cursor.fetchone()
                if guest is None:
                    raise HTTPException(status_code=404, detail="No member account uses this email.")
                if guest["member_id"] == owner_id:
                    raise HTTPException(status_code=422, detail="You are already in this session.")

                cursor.execute(
                    "SELECT status FROM booking_participants WHERE booking_id = %s AND member_id = %s",
                    (booking_id, guest["member_id"]),
                )
                existing = cursor.fetchone()
                if existing is not None and existing["status"] in OPEN_SEATS:
                    raise HTTPException(
                        status_code=409,
                        detail="This member is already in the group."
                        if existing["status"] == "accepted"
                        else "This member has already been invited.",
                    )
                if 1 + _seats_taken(cursor, booking_id) >= GROUP_MAX_SIZE:
                    raise HTTPException(status_code=409, detail=f"This group is full ({GROUP_MAX_SIZE} people at most).")

                cursor.execute(
                    """
                    INSERT INTO booking_participants (booking_id, member_id, status)
                    VALUES (%s, %s, 'invited')
                    ON CONFLICT (booking_id, member_id) DO UPDATE
                    SET status = 'invited', invited_at = CURRENT_TIMESTAMP, responded_at = NULL
                    """,
                    (booking_id, guest["member_id"]),
                )
                notice = _invitation_notice(cursor, booking_id, guest)
                group = _load_group(cursor, booking_id, show_emails=True)

        # Sent after the transaction committed, once the response is on its way.
        if notice is not None:
            background.add_task(send_invitation_email, notice)
        return group
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.delete("/bookings/{booking_id}/group/{member_id}", response_model=GroupDetails)
def remove_participant(
    booking_id: int,
    member_id: int,
    user: CurrentUserResponse = Depends(current_user),
) -> GroupDetails:
    """The owner removes a guest (or takes back an invitation), or a guest leaves."""
    me = _require_member(user)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                booking = _lock_booking(cursor, booking_id)
                is_owner = booking["member_id"] == me
                if not is_owner and member_id != me:
                    raise HTTPException(status_code=403, detail="Only the member who booked can remove people.")
                _ensure_open(booking)
                cursor.execute(
                    """
                    UPDATE booking_participants
                    SET status = %s, responded_at = CURRENT_TIMESTAMP
                    WHERE booking_id = %s AND member_id = %s AND status IN ('invited', 'accepted')
                    RETURNING member_id
                    """,
                    ("left" if member_id == me else "removed", booking_id, member_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(status_code=404, detail="This member is not in the group.")
                return _load_group(cursor, booking_id, show_emails=is_owner)
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.get("/groups/invitations", response_model=list[GroupInvitation])
def my_invitations(user: CurrentUserResponse = Depends(current_user)) -> list[GroupInvitation]:
    """Invitations waiting for an answer and the group sessions this member joined."""
    me = _require_member(user)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT expire_pending_bookings()")
                cursor.execute(
                    """
                    SELECT
                        p.booking_id, p.status, p.invited_at,
                        owner.full_name AS owner_name,
                        b.booking_type, b.status AS booking_status,
                        t.full_name AS trainer_name, h.hall_name,
                        b.start_time, b.end_time,
                        1 + (
                            SELECT COUNT(*) FROM booking_participants a
                            WHERE a.booking_id = b.booking_id AND a.status = 'accepted'
                        ) AS size
                    FROM booking_participants p
                    JOIN bookings b ON b.booking_id = p.booking_id
                    JOIN members owner ON owner.member_id = b.member_id
                    LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
                    LEFT JOIN halls h ON h.hall_id = b.hall_id
                    WHERE p.member_id = %s
                      AND (
                          -- accepted sessions stay listed, also when the owner cancelled them
                          p.status = 'accepted'
                          OR (p.status = 'invited' AND b.status IN ('pending', 'confirmed')
                              AND b.start_time > LOCALTIMESTAMP)
                      )
                    ORDER BY b.start_time DESC
                    LIMIT 200
                    """,
                    (me,),
                )
                return [GroupInvitation(**row) for row in cursor.fetchall()]
    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/groups/invitations/{booking_id}/accept", response_model=GroupDetails)
def accept_invitation(booking_id: int, user: CurrentUserResponse = Depends(current_user)) -> GroupDetails:
    me = _require_member(user)
    ensure_email_verified(member_id=me)
    try:
        with connect(row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                booking = _lock_booking(cursor, booking_id)
                cursor.execute(
                    "SELECT status FROM booking_participants WHERE booking_id = %s AND member_id = %s FOR UPDATE",
                    (booking_id, me),
                )
                invitation = cursor.fetchone()
                if invitation is None or invitation["status"] != "invited":
                    raise HTTPException(status_code=404, detail="Invitation not found.")
                _ensure_open(booking)

                # Same row lock as the booking trigger, so this member cannot book
                # something overlapping while this check runs.
                cursor.execute(
                    "SELECT membership_expires_on FROM members WHERE member_id = %s FOR UPDATE",
                    (me,),
                )
                member = cursor.fetchone()
                expires_on = member["membership_expires_on"] if member else None
                if expires_on is None or booking["start_time"].date() > expires_on:
                    raise HTTPException(status_code=409, detail="Your membership is not valid for this date.")

                cursor.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM bookings b
                        WHERE b.status NOT IN ('cancelled', 'expired')
                          AND b.booking_id <> %s
                          AND b.start_time < %s AND b.end_time > %s
                          AND (
                              b.member_id = %s
                              OR EXISTS (
                                  SELECT 1 FROM booking_participants p
                                  WHERE p.booking_id = b.booking_id AND p.member_id = %s AND p.status = 'accepted'
                              )
                          )
                    ) AS busy
                    """,
                    (booking_id, booking["end_time"], booking["start_time"], me, me),
                )
                if cursor.fetchone()["busy"]:
                    raise HTTPException(
                        status_code=409,
                        detail="You already have another booking during this time. Choose a different time.",
                    )

                cursor.execute(
                    """
                    UPDATE booking_participants
                    SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
                    WHERE booking_id = %s AND member_id = %s
                    """,
                    (booking_id, me),
                )
                return _load_group(cursor, booking_id, show_emails=False)
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


@router.post("/groups/invitations/{booking_id}/decline", status_code=204)
def decline_invitation(booking_id: int, user: CurrentUserResponse = Depends(current_user)) -> None:
    me = _require_member(user)
    try:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE booking_participants
                    SET status = 'declined', responded_at = CURRENT_TIMESTAMP
                    WHERE booking_id = %s AND member_id = %s AND status = 'invited'
                    RETURNING member_id
                    """,
                    (booking_id, me),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Invitation not found.")
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise database_error(error) from None


# ---- invitation email --------------------------------------------------------------


def _invitation_notice(cursor, booking_id: int, guest: dict) -> dict | None:
    cursor.execute(
        """
        SELECT m.full_name AS owner_name, b.start_time, b.end_time,
               t.full_name AS trainer_name, h.hall_name
        FROM bookings b
        JOIN members m ON m.member_id = b.member_id
        LEFT JOIN trainers t ON t.trainer_id = b.trainer_id
        LEFT JOIN halls h ON h.hall_id = b.hall_id
        WHERE b.booking_id = %s
        """,
        (booking_id,),
    )
    row = cursor.fetchone()
    if row is None or not guest.get("email"):
        return None
    return {**row, "booking_id": booking_id, "guest_email": guest["email"], "guest_name": guest["full_name"]}


def _what(notice: dict) -> str:
    parts = []
    if notice.get("trainer_name"):
        parts.append(f"training with {notice['trainer_name']}")
    if notice.get("hall_name"):
        parts.append(f"in {notice['hall_name']}")
    return " ".join(parts) or "a session"


def send_invitation_email(notice: dict) -> None:
    start: datetime = notice["start_time"]
    when = session_when(start, notice["end_time"])
    link = f"{app_url()}/member/groups"
    what = _what(notice)
    text = (
        f"Hello {notice['guest_name']},\n\n"
        f"{notice['owner_name']} invited you to join their session: {what}.\n\n"
        f"When: {when}\n"
        "It is free for you. The member who booked has paid for it.\n\n"
        f"Accept or decline: {link}\n"
    )
    body = (
        f"<p>Hello {html.escape(notice['guest_name'])},</p>"
        f"<p><strong>{html.escape(notice['owner_name'])}</strong> invited you to join their session: "
        f"{html.escape(what)}.</p>"
        f"<p>When: <strong>{html.escape(when)}</strong></p>"
        "<p>It is free for you. The member who booked has paid for it.</p>"
        f'<p><a href="{html.escape(link, quote=True)}" style="display:inline-block;padding:12px 20px;'
        'background:#111;color:#fff;text-decoration:none;border-radius:8px">See the invitation</a></p>'
    )
    try:
        send_email(
            OutgoingEmail(
                to=notice["guest_email"],
                subject=f"{notice['owner_name']} invited you: {start:%d %b, %H:%M}",
                text=text,
                html=body,
            )
        )
    except Exception:
        logger.exception("Could not email group invitation for booking %s", notice["booking_id"])
