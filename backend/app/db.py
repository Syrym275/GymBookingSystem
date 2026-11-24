import atexit
import os
import re
import threading
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from fastapi import HTTPException
from psycopg.rows import RowFactory, tuple_row
from psycopg_pool import ConnectionPool


# Practical email check: local part, dotted domain, and a letter TLD.
# No spaces, no consecutive or edge dots, no commas.
EMAIL_PATTERN = re.compile(
    r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}"
)


def is_valid_email(email: str) -> bool:
    return EMAIL_PATTERN.fullmatch(email) is not None


# ---- connection pool -------------------------------------------------------------
#
# Opening a PostgreSQL connection to a cloud database (Azure) costs several network
# round trips: TCP, TLS and the password exchange. Doing that for every query made each
# page wait for it two or three times. The pool keeps a few connections open and lends
# them out instead.
#
#   DB_POOL_MIN_SIZE  connections kept open while idle (default 2)
#   DB_POOL_MAX_SIZE  most connections open at once (default 10; Azure's smallest tier allows ~50)

POOL_TIMEOUT_SECONDS = 10  # how long a request waits for a free connection before answering 503
CONNECTION_SETTINGS = {
    "connect_timeout": 10,
    # Keepalives stop idle connections being silently dropped by firewalls/NAT between
    # here and Azure, and let a dead connection be noticed instead of hanging.
    "keepalives": 1,
    "keepalives_idle": 60,
    "keepalives_interval": 10,
    "keepalives_count": 3,
}
READ_ONLY_OPTIONS = "-c default_transaction_read_only=on -c statement_timeout=3000"

_pools: dict[tuple[str, bool], ConnectionPool] = {}
_pools_lock = threading.Lock()


def _pool(url: str, read_only: bool) -> ConnectionPool:
    key = (url, read_only)
    pool = _pools.get(key)
    if pool is None:
        with _pools_lock:
            pool = _pools.get(key)
            if pool is None:
                settings = dict(CONNECTION_SETTINGS)
                if read_only:
                    settings["options"] = READ_ONLY_OPTIONS
                pool = ConnectionPool(
                    url,
                    min_size=int(os.environ.get("DB_POOL_MIN_SIZE", "2")),
                    max_size=int(os.environ.get("DB_POOL_MAX_SIZE", "10")),
                    max_idle=240,  # close extra connections after 4 idle minutes
                    timeout=POOL_TIMEOUT_SECONDS,
                    kwargs=settings,
                    name="readonly" if read_only else "main",
                    open=True,
                )
                _pools[key] = pool
    return pool


def _checkout(url: str, read_only: bool = False):
    """Borrow a pooled connection (a context manager). Tests replace this function."""
    return _pool(url, read_only).connection()


@atexit.register
def close_pools() -> None:
    with _pools_lock:
        for pool in _pools.values():
            pool.close(timeout=2)
        _pools.clear()


@contextmanager
def connect(row_factory: RowFactory | None = None, read_only: bool = False) -> Iterator[psycopg.Connection]:
    """Borrow a database connection, or answer 503 when none is configured.

    Works like `with psycopg.connect(...)`: the block is one transaction, committed when
    it finishes and rolled back when it raises. The connection then goes back to the pool.
    A pool that cannot connect raises PoolTimeout, a psycopg.OperationalError.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise HTTPException(
            status_code=503,
            detail="The service is missing its database configuration (DATABASE_URL).",
        )
    with _checkout(url, read_only) as connection:
        if row_factory is not None:
            connection.row_factory = row_factory
        try:
            yield connection
        finally:
            connection.row_factory = tuple_row  # the next borrower expects the default
