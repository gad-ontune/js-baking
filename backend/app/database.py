from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
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


def _upgrade_sqlite_schema(models_module) -> None:
    """Add model columns introduced after the first release to local databases.

    Column names and types are read from the ORM models, so this stays correct
    as new fields are added. PostgreSQL deployments use Alembic instead.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for model in (models_module.User, models_module.AuditLog):
            table = model.__tablename__
            if table not in tables:
                continue
            existing = {column['name'] for column in inspector.get_columns(table)}
            for column in model.__table__.columns:
                if column.name in existing or column.primary_key:
                    continue
                column_type = str(column.type.compile(dialect=engine.dialect))
                nullable = '' if column.nullable else ' NOT NULL'
                connection.execute(text(
                    f'ALTER TABLE {table} ADD COLUMN {column.name} {column_type}{nullable}'
                ))
        if models_module.AuditLog.__tablename__ in tables:
            connection.execute(text(
                'CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_sequence_number '
                'ON audit_logs (sequence_number)'
            ))


def init_db() -> None:
    if settings.database_url.startswith('sqlite:///./'):
        path = Path(settings.database_url.replace('sqlite:///./', ''))
        path.parent.mkdir(parents=True, exist_ok=True)
    from . import models  # noqa: F401 - registers tables before create_all

    Base.metadata.create_all(bind=engine)
    if settings.database_url.startswith('sqlite'):
        _upgrade_sqlite_schema(models)
