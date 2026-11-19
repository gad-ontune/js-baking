"""Configuration guardrails for local and deployed setups."""

from backend.app import models
from backend.app.config import Settings
from backend.app.security import new_id


def test_default_cors_origins_cover_both_local_hosts_and_preview_ports():
    default = Settings.model_fields['cors_origins'].default
    for origin in (
        'http://localhost:5173', 'http://127.0.0.1:5173',
        'http://localhost:4173', 'http://127.0.0.1:4173',
    ):
        assert origin in default.split(',')


def test_id_columns_fit_prefixed_identifiers_on_strict_databases():
    """SQLite ignores VARCHAR lengths; PostgreSQL does not.

    Every generated ID carries a prefix (usr_, audit_, inv-, ...), so a
    36-character column silently works in development and fails in production.
    """
    generated = new_id('usr_')
    assert len(generated) > 36

    id_columns = [
        column
        for model in (models.User, models.Session, models.BusinessRecord,
                      models.AuditLog, models.SecurityToken, models.RecoveryCode)
        for column in model.__table__.columns
        if column.name in {'id', 'user_id', 'created_by', 'issued_by'}
    ]
    assert id_columns
    for column in id_columns:
        assert column.type.length >= len(generated) + 10

