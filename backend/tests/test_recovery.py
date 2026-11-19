"""Password recovery, verification and one-time staff reset tests."""

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.models import AuditLog, User
from backend.app.security import hash_password

API = '/api/v1'
OLD_PASSWORD = 'OldPassword2040!'
NEW_PASSWORD = 'NewPassword2040!'


def _make_user(username='amina', role='owner', email='amina@jsbaking.test'):
    db = SessionLocal()
    try:
        db.add(User(
            id=f'usr_{username}', name=username.title(), username=username, email=email,
            password_hash=hash_password(OLD_PASSWORD), role=role, active=True,
        ))
        db.commit()
    finally:
        db.close()


def _sign_in(client, username, password=OLD_PASSWORD):
    response = client.post(f'{API}/auth/login', json={'username': username, 'password': password})
    assert response.status_code == 200, response.text
    return {'X-CSRF-Token': response.json()['csrf_token']}


def test_owner_recovery_verifies_username_and_email(client):
    _make_user()
    wrong = client.post(f'{API}/auth/forgot-password', json={
        'username': 'amina', 'email': 'someone-else@example.test',
    })
    assert wrong.status_code == 200
    assert wrong.json()['dev_token'] is None

    good = client.post(f'{API}/auth/forgot-password', json={
        'username': 'amina', 'email': 'AMINA@jsbaking.test',
    })
    assert good.status_code == 200
    assert len(good.json()['dev_token']) >= 32
    assert 'password' not in good.text.lower()


def test_recovery_token_is_single_use_and_revokes_sessions(client):
    _make_user()
    before = _sign_in(client, 'amina')
    issued = client.post(f'{API}/auth/forgot-password', json={
        'username': 'amina', 'email': 'amina@jsbaking.test',
    }).json()
    token = issued['dev_token']

    reset = client.post(f'{API}/auth/reset-password', json={
        'token': token, 'new_password': NEW_PASSWORD,
    })
    assert reset.status_code == 200, reset.text
    assert client.get(f'{API}/auth/me', headers=before).status_code == 401
    assert client.post(f'{API}/auth/login', json={'username': 'amina', 'password': OLD_PASSWORD}).status_code == 401
    assert _sign_in(client, 'amina', NEW_PASSWORD)

    reuse = client.post(f'{API}/auth/reset-password', json={
        'token': token, 'new_password': 'AnotherPassword2040!',
    })
    assert reuse.status_code == 400
    assert client.post(f'{API}/auth/login', json={'username': 'amina', 'password': 'AnotherPassword2040!'}).status_code == 401


def test_owner_issues_one_time_code_for_staff_and_token_never_appears_in_audit(client):
    _make_user('amina', 'owner')
    _make_user('brian', 'staff', 'brian@jsbaking.test')
    owner_headers = _sign_in(client, 'amina')

    response = client.post(f'{API}/users/usr_brian/reset-token', headers=owner_headers, json={})
    assert response.status_code == 200, response.text
    token = response.json()['token']
    assert len(token) >= 32
    assert OLD_PASSWORD not in response.text

    reset = client.post(f'{API}/auth/reset-password', json={'token': token, 'new_password': NEW_PASSWORD})
    assert reset.status_code == 200, reset.text
    assert _sign_in(client, 'brian', NEW_PASSWORD)

    db = SessionLocal()
    try:
        entries = db.query(AuditLog).all()
        assert any(entry.action == 'RESET_TOKEN_ISSUED' for entry in entries)
        assert all(token not in (entry.details or '') for entry in entries)
        assert all(token not in str(entry.new_values or '') for entry in entries)
        staff = db.query(User).filter(User.username == 'brian').one()
        assert staff.password_hash != OLD_PASSWORD
        assert OLD_PASSWORD not in staff.password_hash
    finally:
        db.close()


def test_staff_cannot_issue_reset_codes(client):
    _make_user('brian', 'staff', 'brian@jsbaking.test')
    headers = _sign_in(client, 'brian')
    response = client.post(f'{API}/users/usr_brian/reset-token', headers=headers, json={})
    assert response.status_code == 403


def test_email_verification_flow(client):
    _make_user('amina', 'owner')
    headers = _sign_in(client, 'amina')

    issue = client.post(f'{API}/auth/email/verification-code', headers=headers, json={})
    assert issue.status_code == 200, issue.text
    code = issue.json()['dev_token']
    assert code

    verify = client.post(f'{API}/auth/email/verify', headers=headers, json={'token': code})
    assert verify.status_code == 200, verify.text
    assert client.get(f'{API}/auth/me').json()['email_verified_at'] is not None
    assert client.post(f'{API}/auth/email/verify', headers=headers, json={'token': code}).status_code == 400


def test_production_without_smtp_fails_closed(client, monkeypatch):
    _make_user('amina', 'owner')
    monkeypatch.setattr(settings, 'environment', 'production')
    monkeypatch.setattr(settings, 'smtp_host', '')
    response = client.post(f'{API}/auth/forgot-password', json={
        'username': 'amina', 'email': 'amina@jsbaking.test',
    })
    assert response.status_code == 503
    assert 'dev_token' not in response.text


def test_forgot_password_rejects_untrusted_origin(client):
    _make_user('amina', 'owner')
    response = client.post(f'{API}/auth/forgot-password', headers={'Origin': 'https://evil.test'}, json={
        'username': 'amina', 'email': 'amina@jsbaking.test',
    })
    assert response.status_code == 403
