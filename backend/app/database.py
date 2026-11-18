from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs() -> dict:
    if settings.database_url.startswith('sqlite'):
        return {
            'connect_args': {'check_same_thread': False},
            'poolclass': StaticPool,
        }
    return {'pool_pre_ping': True}


engine = create_engine(settings.database_url, **_engine_kwargs())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    if settings.database_url.startswith('sqlite:///./'):
        path = Path(settings.database_url.replace('sqlite:///./', ''))
        path.parent.mkdir(parents=True, exist_ok=True)
    from . import models  # noqa: F401 - registers tables before create_all

    Base.metadata.create_all(bind=engine)
