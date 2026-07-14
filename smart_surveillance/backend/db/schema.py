"""Database schema creation for PostgreSQL."""

from __future__ import annotations

from psycopg2.extensions import connection

CREATE_USERS_TABLE = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


def create_tables(conn: connection) -> None:
    """Create required backend tables.

    The pool's database user must have permission to create tables in the
    public schema.  When that permission is missing PostgreSQL raises
    ``psycopg2.errors.InsufficientPrivilege``; we catch the exception here
    and log a warning rather than crashing the whole application.
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(CREATE_USERS_TABLE)
        conn.commit()
    except Exception as exc:
        from psycopg2 import errors

        if isinstance(exc, errors.InsufficientPrivilege):
            print(
                "WARNING: insufficient privileges to create tables; "
                "grant rights on schema public or pre-create them manually."
            )
            return
        raise