"""Emails a trainer when a training session with them is booked or cancelled.

A training booking starts as an unpaid 15-minute hold ("pending") and only
becomes a real session once it is paid ("confirmed"). Trainers are emailed at
that point, so they never hear about holds that expire unpaid. For the same
reason, a cancellation is only emailed when the cancelled booking was confirmed.

The email goes to the address of the trainer's active login (users.trainer_id).
Trainers without a login get no email. Sending happens after the response, and
a failure is logged without affecting the payment.
"""

import html
import logging
from dataclasses import dataclass
from datetime import datetime

from .mailer import OutgoingEmail, send_email
from .verification import app_url


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrainerSessionNotice:
    booking_id: int
    trainer_email: str
    trainer_name: str
    member_name: str
    start_time: datetime
    end_time: datetime


def load_session_notice(cursor, booking_id: int) -> TrainerSessionNotice | None:
    """Read what the email needs. Expects a dict_row cursor. None when nobody can be emailed."""
    cursor.execute(
        """
        SELECT
            b.booking_id,
            u.email AS trainer_email,
            t.full_name AS trainer_name,
            m.full_name AS member_name,
            b.start_time,
            b.end_time
        FROM bookings b
        JOIN trainers t ON t.trainer_id = b.trainer_id
        JOIN members m ON m.member_id = b.member_id
        JOIN users u ON u.trainer_id = b.trainer_id AND u.is_active = TRUE
        WHERE b.booking_id = %s
          AND b.booking_type = 'training'
        """,
        (booking_id,),
    )
    row = cursor.fetchone()
    if row is None or not row.get("trainer_email"):
        return None
    return TrainerSessionNotice(**row)


def session_when(start: datetime, end: datetime) -> str:
    return f"{start:%A, %d %B %Y}, {start:%H:%M}–{end:%H:%M}"


def _send(notice: TrainerSessionNotice, subject: str, before: str, after: str, footer: str) -> None:
    """The headline is before + member name + after; the name is bold in the HTML version."""
    when = session_when(notice.start_time, notice.end_time)
    schedule = f"{app_url()}/trainer/schedule"
    text = (
        f"Hello {notice.trainer_name},\n\n"
        f"{before}{notice.member_name}{after}\n\n"
        f"When: {when}\n"
        f"Booking: #{notice.booking_id}\n\n"
        f"{footer}\n"
        f"See your schedule: {schedule}\n"
    )
    safe_schedule = html.escape(schedule, quote=True)
    body = (
        f"<p>Hello {html.escape(notice.trainer_name)},</p>"
        f"<p>{html.escape(before)}<strong>{html.escape(notice.member_name)}</strong>{html.escape(after)}</p>"
        f"<p>When: <strong>{html.escape(when)}</strong><br>Booking: #{notice.booking_id}</p>"
        f"<p>{html.escape(footer)}</p>"
        f'<p><a href="{safe_schedule}" style="display:inline-block;padding:12px 20px;background:#111;'
        'color:#fff;text-decoration:none;border-radius:8px">Open my schedule</a></p>'
    )
    try:
        send_email(OutgoingEmail(to=notice.trainer_email, subject=subject, text=text, html=body))
    except Exception:
        logger.exception("Could not email trainer about booking %s", notice.booking_id)


def send_trainer_session_email(notice: TrainerSessionNotice) -> None:
    _send(
        notice,
        subject=f"New session booked: {notice.start_time:%d %b, %H:%M}",
        before="",
        after=" booked a training session with you.",
        footer="The session is paid and on your schedule.",
    )


def send_trainer_cancellation_email(notice: TrainerSessionNotice) -> None:
    _send(
        notice,
        subject=f"Session cancelled: {notice.start_time:%d %b, %H:%M}",
        before="Your training session with ",
        after=" was cancelled.",
        footer="This time slot is free again.",
    )
