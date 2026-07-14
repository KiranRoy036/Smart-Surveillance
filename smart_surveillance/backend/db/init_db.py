"""Initialize PostgreSQL tables.

Usage:
    python -m db.init_db
"""

from __future__ import annotations

from db.database import close_db_pool, get_db_connection, init_db_pool
from db.schema import create_tables


def main() -> None:
    init_db_pool()
    db_dependency = get_db_connection()
    conn = next(db_dependency)
    try:
        create_tables(conn)
        print("Database schema initialized successfully")
    finally:
        db_dependency.close()
        close_db_pool()


if __name__ == "__main__":
    main()