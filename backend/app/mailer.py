"""Sends account emails through a swappable sender.

The rest of the app calls send_email() and never talks to a provider directly.
To add a provider (SES, Postmark, Resend, SendGrid...), write a class with a
send(message) method and return it from get_sender().

Environment variables (see backend/.env.example):

    EMAIL_BACKEND  "console" or "smtp". Defaults to "smtp" when SMTP_HOST is set, else "console".
    EMAIL_FROM     Sender address, e.g. "PulseGym <no-reply@yourdomain.kz>". Required for smtp.
    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      587 (STARTTLS, default) or 465 (TLS from the start)
    SMTP_USER      Login for the SMTP server, if it needs one
    SMTP_PASSWORD  Password (for Gmail: an app password)
"""

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    def send(self, message: OutgoingEmail) -> None: ...


class ConsoleSender:
    """Development: prints the email instead of sending it."""

    def send(self, message: OutgoingEmail) -> None:
        print(
            f"\n[email] Not sent (EMAIL_BACKEND=console). To: {message.to}\n"
            f"[email] Subject: {message.subject}\n{message.text}\n",
            flush=True,
        )


class SmtpSender:
    def __init__(self, host: str, port: int, user: str, password: str, sender: str):
        self.host, self.port, self.user, self.password, self.sender = host, port, user, password, sender

    def send(self, message: OutgoingEmail) -> None:
        email = EmailMessage()
        email["Subject"] = message.subject
        email["From"] = self.sender
        email["To"] = message.to
        email.set_content(message.text)
        email.add_alternative(message.html, subtype="html")

        context = ssl.create_default_context()
        if self.port == 465:
            smtp = smtplib.SMTP_SSL(self.host, self.port, timeout=15, context=context)
        else:
            smtp = smtplib.SMTP(self.host, self.port, timeout=15)
        with smtp:
            if self.port != 465:
                smtp.starttls(context=context)
            if self.user:
                # Log in with PLAIN only. smtplib otherwise retries with LOGIN after a
                # rejected password, and Gmail then drops the connection, which hides
                # the real "535 Username and Password not accepted" error.
                smtp.ehlo()
                smtp.user, smtp.password = self.user, self.password
                smtp.auth("PLAIN", smtp.auth_plain)
            smtp.send_message(email)


def get_sender() -> EmailSender:
    backend = os.environ.get("EMAIL_BACKEND", "").strip().lower()
    host = os.environ.get("SMTP_HOST", "").strip()
    if not backend:
        backend = "smtp" if host else "console"

    if backend == "console":
        return ConsoleSender()
    if backend == "smtp":
        user = os.environ.get("SMTP_USER", "").strip()
        sender = os.environ.get("EMAIL_FROM", "").strip() or user
        if not host or not sender:
            raise RuntimeError("EMAIL_BACKEND=smtp needs SMTP_HOST and EMAIL_FROM (or SMTP_USER).")
        return SmtpSender(host, int(os.environ.get("SMTP_PORT", "587")), user, os.environ.get("SMTP_PASSWORD", ""), sender)
    raise RuntimeError(f"Unknown EMAIL_BACKEND {backend!r}. Use 'console' or 'smtp'.")


def send_email(message: OutgoingEmail) -> None:
    get_sender().send(message)
