"""Database engine and session lifecycle for the single-container POC."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings


class Base(DeclarativeBase):
    """Base class for persistent POC entities."""


def build_engine(settings: Settings):
    """Build an SQLAlchemy engine and ensure local SQLite parent directories exist."""
    if settings.database_url.startswith("sqlite:///"):
        database_path = settings.database_url.removeprefix("sqlite:///")
        Path(database_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
        pool_pre_ping=True,
    )


def build_session_factory(settings: Settings) -> sessionmaker[Session]:
    """Create the request and worker session factory."""
    return sessionmaker(bind=build_engine(settings), autoflush=False, autocommit=False)


# PUBLIC_INTERFACE
def get_db() -> Generator[Session, None, None]:
    """Yield the request database session configured by the application lifespan."""
    from app.main import app_state

    session = app_state.session_factory()
    try:
        yield session
    finally:
        session.close()


def initialize_database(session_factory: sessionmaker[Session]) -> None:
    """Create the POC schema and apply additive local POC schema upgrades."""
    from app import models  # noqa: F401 - imports mapped entities

    engine = session_factory.kw["bind"]
    Base.metadata.create_all(engine)
    existing_columns = {column["name"] for column in inspect(engine).get_columns("processing_runs")}
    if "failure_code" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE processing_runs ADD COLUMN failure_code VARCHAR(64)"))
