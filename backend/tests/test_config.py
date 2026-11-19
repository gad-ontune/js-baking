"""Configuration guardrails for local and deployed setups."""

import pytest

from backend.app import models
from backend.app.config import Settings
from backend.app.security import new_id
from backend.scripts.provision_database import MIN_PASSWORD_LENGTH, _password


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


def test_role_urls_fall_back_to_the_application_url_for_local_development():
    settings = Settings(database_url='sqlite:///./jsbh_dev.db')
    assert settings.bootstrap_url == settings.database_url
    assert settings.migration_url == settings.database_url


def test_role_urls_can_be_distinct_in_deployments():
    settings = Settings(
        database_url='postgresql+psycopg://app:secret@db/jsbh',
        bootstrap_database_url='postgresql+psycopg://root:secret@db/jsbh',
        migration_database_url='postgresql+psycopg://owner:secret@db/jsbh',
    )
    assert settings.bootstrap_url.endswith('root:secret@db/jsbh')
    assert settings.migration_url.endswith('owner:secret@db/jsbh')
    assert settings.database_url.endswith('app:secret@db/jsbh')


def test_database_role_passwords_reject_short_values(monkeypatch):
    monkeypatch.delenv('JSBH_TEST_ROLE_PASSWORD', raising=False)
    with pytest.raises(SystemExit):
        _password('JSBH_TEST_ROLE_PASSWORD', 'runtime API')
    monkeypatch.setenv('JSBH_TEST_ROLE_PASSWORD', 'x' * MIN_PASSWORD_LENGTH)
    assert _password('JSBH_TEST_ROLE_PASSWORD', 'runtime API') == 'x' * MIN_PASSWORD_LENGTH

