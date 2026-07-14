"""PostgreSQL connection pooling utilities."""

from __future__ import annotations

import os
from collections.abc import Generator

from psycopg2.extensions import connection
from psycopg2.pool import SimpleConnectionPool

# Load .env file if present (works on all platforms, silent if file missing)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; rely on environment variables only

# Matches the credentials in README and the database setup SQL
DEFAULT_DATABASE_URL = "postgresql://surveillance_user:surveillance_pass@localhost:5432/surveillance"


class DatabasePool:
    """Global PostgreSQL connection pool manager."""

    def __init__(self) -> None:
        self._pool: SimpleConnectionPool | None = None

    def initialize(self) -> None:
        """Initialize pool only once."""
        if self._pool is not None:
            return

        database_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
        self._pool = SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=database_url,
        )

    def close(self) -> None:
        """Close all pooled connections."""
        if self._pool is not None:
            self._pool.closeall()
            self._pool = None

    def acquire(self) -> connection:
        """Borrow one connection from pool."""
        if self._pool is None:
            self.initialize()

        if self._pool is None:
            raise RuntimeError("Database pool is not initialized")

        return self._pool.getconn()

    def release(self, conn: connection) -> None:
        """Return one connection to pool."""
        if self._pool is None:
            conn.close()
            return

        self._pool.putconn(conn)


_db_pool = DatabasePool()


def init_db_pool() -> None:
    """Initialize global DB pool."""
    _db_pool.initialize()


def close_db_pool() -> None:
    """Close global DB pool."""
    _db_pool.close()


def get_db_connection() -> Generator[connection, None, None]:
    """FastAPI dependency that yields PostgreSQL connection."""
    conn = _db_pool.acquire()
    try:
        yield conn
    finally:
        _db_pool.release(conn)
