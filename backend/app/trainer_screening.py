"""Transparent automatic checks for new trainer applications.

These checks validate application data, not professional qualifications. Applications
outside the configured price band remain in the admin queue for a human decision.
"""

import os
from decimal import Decimal, InvalidOperation


def _setting(name: str, default: str) -> Decimal:
    try:
        return Decimal(os.getenv(name, default))
    except InvalidOperation:
        return Decimal(default)


MIN_AUTO_APPROVE_PRICE_KZT = _setting("TRAINER_AUTO_APPROVE_MIN_PRICE_KZT", "100")
MAX_AUTO_APPROVE_PRICE_KZT = _setting("TRAINER_AUTO_APPROVE_MAX_PRICE_KZT", "50000")


def review_reasons(application: dict) -> list[str]:
    """Return stable reason codes; an empty list means eligible for auto-approval."""
    reasons: list[str] = []
    if not application.get("email_verified"):
        reasons.append("email_unverified")

    name = " ".join(str(application.get("full_name") or "").split())
    specialization = " ".join(str(application.get("specialization") or "").split())
    if not 2 <= len(name) <= 100 or not 2 <= len(specialization) <= 60:
        reasons.append("profile_incomplete")

    try:
        price = Decimal(str(application.get("session_price_kzt")))
    except (InvalidOperation, TypeError, ValueError):
        price = Decimal("NaN")
    if not price.is_finite() or not MIN_AUTO_APPROVE_PRICE_KZT <= price <= MAX_AUTO_APPROVE_PRICE_KZT:
        reasons.append("price_out_of_range")
    return reasons
