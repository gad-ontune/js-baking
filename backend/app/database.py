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


_SQLITE_COLUMN_UPGRADES = {
    'users': {
        'email_verified_at': 'DATETIME',
        'mfa_secret_enc': 'TEXT',  # nosec B105 - column name, not a credential
    },
    'audit_logs': {
        'sequence_number': 'INTEGER',
        'previous_hash': 'VARCHAR(64)',
        'entry_hash': 'VARCHAR(64)',
    },
}


def _upgrade_sqlite_schema() -> None:
    """Add columns introduced after the first release to local demo databases.

    Deployments on PostgreSQL use Alembic migrations instead.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table, columns in _SQLITE_COLUMN_UPGRADES.items():
            if table not in tables:
                continue
            existing = {column['name'] for column in inspector.get_columns(table)}
            for name, column_type in columns.items():
                if name not in existing:
                    connection.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {column_type}'))
        if 'audit_logs' in tables:
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
        _upgrade_sqlite_schema()
