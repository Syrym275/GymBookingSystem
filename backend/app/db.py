import os
import re

import psycopg
from fastapi import HTTPException


# Practical email check: local part, dotted domain, and a letter TLD.
# No spaces, no consecutive or edge dots, no commas.
EMAIL_PATTERN = re.compile(
    r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}"
)


def is_valid_email(email: str) -> bool:
    return EMAIL_PATTERN.fullmatch(email) is not None


def connect(**kwargs) -> psycopg.Connection:
    """Open a PostgreSQL connection, or answer 503 when none is configured."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(
            status_code=503,
            detail="The service is missing its database configuration (DATABASE_URL).",
        )
    return psycopg.connect(url, **kwargs)
