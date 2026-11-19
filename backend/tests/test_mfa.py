"""TOTP enrolment, challenge login and recovery-code tests."""

import pyotp
from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import RecoveryCode, User
from backend.app.security import hash_password

API = '/api/v1'
PASSWORD = 'MfaPassword2040!'


def _make_user(username='amina', role='owner'):
    db = SessionLocal()
    try:
        db.add(User(
            id=f'usr_{username}', name=username.title(), username=username,
            email=f'{username}@jsbaking.test', password_hash=hash_password(PASSWORD),
            role=role, active=True,
        ))
        db.commit()
    finally:
        db.close()


def _sign_in(client, username='amina'):
    response = client.post(f'{API}/auth/login', json={'username': username, 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return {'X-CSRF-Token': response.json()['csrf_token']}


def _enrol(client, headers):
    setup = client.post(f'{API}/auth/mfa/setup', headers=headers, json={})
    assert setup.status_code == 200, setup.text
    data = setup.json()
    code = pyotp.TOTP(data['secret']).now()
    enabled = client.post(f'{API}/auth/mfa/enable', headers=headers, json={'code': code})
    assert enabled.status_code == 200, enabled.text
    return data


def test_mfa_enrolment_encrypts_secret_and_hashes_recovery_codes(client):
    _make_user()
    headers = _sign_in(client)
    data = _enrol(client, headers)

    assert len(data['recovery_codes']) == 10
    assert data['provisioning_uri'].startswith('otpauth://totp/')
    assert data['secret'] not in client.get(f'{API}/auth/me').text

    db = SessionLocal()
    try:
        user = db.query(User).one()
        assert user.mfa_enabled is True
        assert user.mfa_secret_enc
        assert data['secret'] not in user.mfa_secret_enc
        codes = db.query(RecoveryCode).all()
        assert len(codes) == 10
        assert all(data['secret'] != code.code_hash for code in codes)
    finally:
        db.close()


def test_login_requires_second_factor_before_creating_a_session(client):
    _make_user()
    headers = _sign_in(client)
    enrolment = _enrol(client, headers)

    # A fresh browser (no pre-existing session) must complete the challenge.
    login_client = TestClient(app)
    first = login_client.post(f'{API}/auth/login', json={'username': 'amina', 'password': PASSWORD})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body['mfa_required'] is True
    assert body['csrf_token'] is None
    challenge = body['mfa_challenge_token']

    assert login_client.get(f'{API}/auth/me').status_code == 401

    wrong = login_client.post(f'{API}/auth/mfa/complete', json={'challenge_token': challenge, 'code': '000000'})
    assert wrong.status_code == 401
    assert login_client.get(f'{API}/auth/me').status_code == 401

    correct = pyotp.TOTP(enrolment['secret']).now()
    completed = login_client.post(f'{API}/auth/mfa/complete', json={
        'challenge_token': challenge, 'code': correct,
    })
    assert completed.status_code == 200, completed.text
    assert completed.json()['csrf_token']
    assert login_client.get(f'{API}/auth/me').status_code == 200


def test_recovery_code_is_single_use(client):
    _make_user()
    headers = _sign_in(client)
    enrolment = _enrol(client, headers)
    recovery = enrolment['recovery_codes'][0]

    first = client.post(f'{API}/auth/login', json={'username': 'amina', 'password': PASSWORD}).json()
    completed = client.post(f'{API}/auth/mfa/complete', json={
        'challenge_token': first['mfa_challenge_token'], 'code': recovery,
    })
    assert completed.status_code == 200, completed.text

    # After signing out, the same recovery code cannot be reused.
    client.post(f'{API}/auth/logout', headers={'X-CSRF-Token': completed.json()['csrf_token']})
    second = client.post(f'{API}/auth/login', json={'username': 'amina', 'password': PASSWORD}).json()
    assert client.post(f'{API}/auth/mfa/complete', json={
        'challenge_token': second['mfa_challenge_token'], 'code': recovery,
    }).status_code == 401


def test_disabling_mfa_requires_password_and_valid_code(client):
    _make_user()
    headers = _sign_in(client)
    enrolment = _enrol(client, headers)

    bad = client.post(f'{API}/auth/mfa/disable', headers=headers, json={
        'code': pyotp.TOTP(enrolment['secret']).now(), 'password': 'wrong-password',
    })
    assert bad.status_code == 403

    good = client.post(f'{API}/auth/mfa/disable', headers=headers, json={
        'code': pyotp.TOTP(enrolment['secret']).now(), 'password': PASSWORD,
    })
    assert good.status_code == 200, good.text
    assert client.get(f'{API}/auth/me').json()['mfa_enabled'] is False
    assert client.post(f'{API}/auth/login', json={'username': 'amina', 'password': PASSWORD}).json()['mfa_required'] is False


def test_mfa_setup_fails_closed_in_production_without_key(client, monkeypatch):
    _make_user()
    headers = _sign_in(client)
    monkeypatch.setattr(settings, 'environment', 'production')
    monkeypatch.setattr(settings, 'mfa_encryption_key', '')
    response = client.post(f'{API}/auth/mfa/setup', headers=headers, json={})
    assert response.status_code == 503
