"""Security anomaly alert tests for the audit-derived alert rules."""

import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.app import alerting
from backend.app.audit import record_audit, verify_chain
from backend.app.config import Settings, settings
from backend.app.models import AuditLog


def _request(ip: str = '203.0.113.5'):
    return SimpleNamespace(
        headers={'x-forwarded-for': ip, 'user-agent': 'alert-test'},
        client=SimpleNamespace(host='127.0.0.1'),
    )


@pytest.fixture
def alerts(monkeypatch):
    """Capture alert payloads and reset deduplication state for each test."""
    monkeypatch.setattr(settings, 'alert_email_to', '')
    monkeypatch.setattr(settings, 'alert_webhook_url', 'https://alerts.example.test/hook')
    monkeypatch.setattr(settings, 'alert_failed_login_threshold', 3)
    monkeypatch.setattr(settings, 'alert_window_minutes', 15)
    monkeypatch.setattr(settings, 'alert_cooldown_minutes', 30)
    monkeypatch.setattr(settings, 'redis_url', '')
    alerting.reset_alert_state()
    sent: list[dict] = []
    monkeypatch.setattr(alerting, '_post_webhook', lambda payload: sent.append(payload) or True)
    yield sent
    alerting.reset_alert_state()


def test_failed_login_burst_alerts_once(db, alerts):
    for _ in range(3):
        record_audit(
            db, _request(), event_type='AUTH', action='LOGIN_FAILED',
            entity='Authentication', outcome='failure',
        )

    assert len(alerts) == 1
    assert alerts[0]['kind'] == 'auth.login_burst'
    assert alerts[0]['details']['failed_attempts'] >= 3
    assert alerts[0]['details']['source_ip'] == '203.0.113.5'

    # Further failures within the cooldown do not produce an alert storm.
    record_audit(
        db, _request(), event_type='AUTH', action='LOGIN_FAILED',
        entity='Authentication', outcome='failure',
    )
    assert len(alerts) == 1


def test_privileged_changes_and_recovery_issue_alerts(db, alerts):
    events = [
        ('USER', 'USER_ROLE_CHANGED'),
        ('USER', 'USER_DEACTIVATED'),
        ('USER', 'RESET_TOKEN_ISSUED'),
    ]
    for index, (event_type, action) in enumerate(events):
        record_audit(
            db, _request(), event_type=event_type, action=action,
            entity='User', entity_id=f'usr_{index}', user_id='usr_actor',
        )

    assert [alert['kind'] for alert in alerts] == [
        'privileged.role_change',
        'privileged.status_change',
        'privileged.reset_issued',
    ]
    # Alerts must never carry a recovery token or password material.
    serialized = json.dumps(alerts).lower()
    for secret in ('password_hash', 'mfa_secret', 'csrf_token', 'token value'):
        assert secret not in serialized


def test_audit_chain_failure_alerts_once(alerts):
    result = {'valid': False, 'checked': 12, 'first_invalid_sequence': 13}
    assert alerting.alert_chain_failure(result) is True
    assert alerting.alert_chain_failure(result) is False
    assert len(alerts) == 1
    assert alerts[0]['kind'] == 'integrity.chain_failure'
    assert alerts[0]['details']['first_invalid_sequence'] == 13


def test_verify_chain_alerts_on_tampering(db, alerts):
    entry = record_audit(
        db, _request(), event_type='AUTH', action='LOGIN_FAILED',
        entity='Authentication', outcome='failure',
    )
    entry.details = 'tampered'
    db.commit()

    result = verify_chain(db)
    assert result['valid'] is False
    assert any(alert['kind'] == 'integrity.chain_failure' for alert in alerts)


def test_production_webhook_must_use_https():
    with pytest.raises(ValidationError):
        Settings(environment='production', alert_webhook_url='http://insecure.example.test/hook')
