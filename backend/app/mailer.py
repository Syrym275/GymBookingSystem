"""Sends account emails.

With SMTP_HOST set, mail goes out over SMTP (STARTTLS on port 587 by default).
Without it, the message is written to the backend log so you can test locally.

    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      default 587
    SMTP_USER      login for the SMTP server
    SMTP_PASSWORD  password (for Gmail: an app password)
    SMTP_FROM      sender address, defaults to SMTP_USER
"""

import os
import smtplib
from email.message import EmailMessage


def send_verification_code(to: str, code: str, minutes_valid: int) -> None:
    subject = "Your PulseGym confirmation code"
    body = (
        f"Your PulseGym confirmation code is {code}.\n\n"
        f"Enter it on the sign-up page within {minutes_valid} minutes.\n"
        "If you did not create an account, you can ignore this email.\n"
    )

    host = os.environ.get("SMTP_HOST")
    if not host:
        # Development fallback: print to the backend terminal instead of sending.
        print(f"\n[email] SMTP_HOST not set. To: {to} | Confirmation code: {code}\n", flush=True)
        return

    user = os.environ.get("SMTP_USER", "")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = os.environ.get("SMTP_FROM") or user
    message["To"] = to
    message.set_content(body)

    with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=15) as smtp:
        smtp.starttls()
        if user:
            smtp.login(user, os.environ.get("SMTP_PASSWORD", ""))
        smtp.send_message(message)
