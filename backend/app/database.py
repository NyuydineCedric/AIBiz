from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def run_lightweight_migrations():
    """Adds any new columns that don't exist yet on already-created SQLite
    tables. Base.metadata.create_all only creates missing tables, not
    missing columns on tables that already exist — this project has no
    Alembic setup, so this keeps existing local databases from breaking
    when a new column is added to a model."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    additions = {
        "datasets": {
            "forecast_insight_cache": "TEXT",
            "source": "TEXT DEFAULT 'upload'",
        },
    }

    with engine.connect() as conn:
        for table, columns in additions.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            for col, ddl in columns.items():
                if col not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
        conn.commit()
