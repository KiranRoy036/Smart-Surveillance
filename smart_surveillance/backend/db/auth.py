"""User registration and authentication backed by PostgreSQL."""

from __future__ import annotations

import hashlib
import os

from psycopg2 import errors
from psycopg2.extensions import connection


def _hash_password(password: str) -> str:
    """Hash password with sha256 + random salt. No length limit."""
    salt = os.urandom(32).hex()
    h = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}${h}"


def _verify_password(password: str, stored: str) -> bool:
    """Verify password against stored salt$hash."""
    try:
        salt, h = stored.split("$", 1)
        return hashlib.sha256(f"{salt}{password}".encode()).hexdigest() == h
    except Exception:
        return False


def register_user(conn: connection, username: str, password: str, role: str) -> dict:
    """Create a new user with hashed password."""
    password_hash = _hash_password(password)

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
                RETURNING id, username, role, created_at
                """,
                (username.strip(), password_hash, role.strip()),
            )
            row = cursor.fetchone()
        conn.commit()
    except errors.UniqueViolation as exc:
        conn.rollback()
        raise ValueError("Username already exists") from exc

    return {
        "id": row[0],
        "username": row[1],
        "role": row[2],
        "created_at": row[3].isoformat() if row[3] else None,
    }


def authenticate_user(conn: connection, username: str, password: str) -> dict | None:
    """Validate credentials and return user info on success."""
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, username, password_hash, role, created_at
            FROM users
            WHERE username = %s
            LIMIT 1
            """,
            (username.strip(),),
        )
        row = cursor.fetchone()

    if row is None:
        return None

    if not _verify_password(password, row[2]):
        return None

    return {
        "id": row[0],
        "username": row[1],
        "role": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
    }
