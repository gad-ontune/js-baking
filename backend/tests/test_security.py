"""Automated security tests for the backend foundation.

No production data is used. Every account and request is synthetic.
"""

from datetime import timedelta

from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app, create_app
from backend.app.models import AuditLog, Session as SessionModel, User
from backend.app.security import (
    hash_password,
    needs_rehash,
    password_policy_error,
    utc_now,
    verify_password,
)

API = '/api/v1'
VALID_PASSWORD = 'CorrectHorseBattery42'
NEW_PASSWORD = 'NewCorrectHorse99'


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def create_user(db, username, role='staff', password=VALID_PASSWORD, active=True, name=None):
    user = User(
        id=f'usr_{username}',
        name=name or username.title(),
        username=username.lower(),
        email=f'{username}@jsbaking.test',
        password_hash=hash_password(password),
        role=role,
        active=active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login(client, username, password=VALID_PASSWORD):
    return client.post(f'{API}/auth/login', json={'username': username, 'password': password})


def csrf_headers(client, username, password=VALID_PASSWORD):
    response = login(client, username, password)
    assert response.status_code == 200, response.text
    return {'X-CSRF-Token': response.json()['csrf_token']}


def user_payload(username, password=VALID_PASSWORD):
    return {
        'name': f'{username.title()} User',
        'username': username,
        'email': f'{username}@jsbaking.test',
        'password': password,
    }


# --------------------------------------------------------------------------
# Password security
# --------------------------------------------------------------------------

def test_password_hashing_uses_argon2id_and_verifies():
    hashed = hash_password(VALID_PASSWORD)
    assert hashed != VALID_PASSWORD
    assert hashed.startswith('$argon2id$')
    assert verify_password(hashed, VALID_PASSWORD)
    assert not verify_password(hashed, 'wrong-password')
    assert not needs_rehash(hashed)


def test_password_policy_rejects_short_common_and_padded_values():
    assert password_policy_error('short')
    assert password_policy_error('qwerty123456')
    assert password_policy_error(f' {VALID_PASSWORD} ')
    assert password_policy_error(VALID_PASSWORD) is None


def test_stored_password_is_never_plaintext(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.post(f'{API}/users', headers=headers, json=user_payload('newstaff'))
    assert response.status_code == 201, response.text
    assert 'password' not in response.json()

    stored = db.query(User).filter(User.username == 'newstaff').first()
    assert stored.password_hash != VALID_PASSWORD
    assert verify_password(stored.password_hash, VALID_PASSWORD)


# --------------------------------------------------------------------------
# Authentication and sessions
# --------------------------------------------------------------------------

def test_login_sets_httponly_cookie_and_returns_no_hash(client, db):
    create_user(db, 'owner', 'owner')
    response = login(client, 'owner')
    assert response.status_code == 200, response.text
    assert response.json()['user']['username'] == 'owner'
    assert 'password_hash' not in response.json()['user']
    assert response.json()['csrf_token']

    cookies = response.headers.get('set-cookie', '')
    assert 'jsbh_session=' in cookies
    assert 'HttpOnly' in cookies
    assert 'SameSite=lax' in cookies


def test_failed_login_is_generic_and_audited(client, db):
    create_user(db, 'owner', 'owner')
    response = login(client, 'owner', 'definitely-wrong-password')
    assert response.status_code == 401
    assert response.json()['detail'] == 'Incorrect username or password.'

    entry = db.query(AuditLog).filter(AuditLog.action == 'LOGIN_FAILED').first()
    assert entry is not None
    assert entry.outcome == 'failure'


def test_inactive_user_cannot_log_in(client, db):
    create_user(db, 'disabled', 'staff', active=False)
    response = login(client, 'disabled')
    assert response.status_code == 401


def test_logout_revokes_session(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    assert client.get(f'{API}/auth/me').status_code == 200
    assert client.post(f'{API}/auth/logout', headers=headers).status_code == 204
    assert client.get(f'{API}/auth/me').status_code == 401


def test_expired_session_is_rejected(client, db):
    owner = create_user(db, 'owner', 'owner')
    csrf_headers(client, 'owner')
    session = db.query(SessionModel).filter(SessionModel.user_id == owner.id).first()
    session.expires_at = utc_now() - timedelta(seconds=1)
    db.commit()
    assert client.get(f'{API}/auth/me').status_code == 401


def test_idle_session_is_rejected(client, db):
    owner = create_user(db, 'owner', 'owner')
    csrf_headers(client, 'owner')
    session = db.query(SessionModel).filter(SessionModel.user_id == owner.id).first()
    session.last_seen_at = utc_now() - timedelta(minutes=60)
    db.commit()
    assert client.get(f'{API}/auth/me').status_code == 401


def test_password_change_rotates_session_and_audits(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.post(
        f'{API}/auth/change-password',
        headers=headers,
        json={'current_password': VALID_PASSWORD, 'new_password': NEW_PASSWORD},
    )
    assert response.status_code == 200, response.text
    assert response.json()['csrf_token'] != headers['X-CSRF-Token']

    # The old CSRF token no longer matches the new cookie.
    replay = client.post(
        f'{API}/auth/change-password',
        headers=headers,
        json={'current_password': NEW_PASSWORD, 'new_password': VALID_PASSWORD},
    )
    assert replay.status_code == 403

    assert db.query(AuditLog).filter(AuditLog.action == 'PASSWORD_CHANGED').first()
    stale_client = TestClient(app)
    assert login(stale_client, 'owner', VALID_PASSWORD).status_code == 401
    assert login(stale_client, 'owner', NEW_PASSWORD).status_code == 200


def test_login_rate_limit_returns_429(client, db):
    create_user(db, 'owner', 'owner')
    for _ in range(5):
        assert login(client, 'owner', 'definitely-wrong-password').status_code == 401
    assert login(client, 'owner', 'definitely-wrong-password').status_code == 429


def test_sql_injection_payload_does_not_authenticate(client, db):
    create_user(db, 'owner', 'owner')
    for injected in ("' OR 1=1 --", "owner'--", "admin' OR '1'='1"):
        response = client.post(
            f'{API}/auth/login',
            json={'username': injected, 'password': 'anything-long-enough'},
        )
        assert response.status_code == 401, (injected, response.text)


# --------------------------------------------------------------------------
# Authorization / RBAC
# --------------------------------------------------------------------------

def test_protected_endpoints_require_authentication(client):
    for path in ('/auth/me', '/users', '/audit'):
        response = client.get(f'{API}{path}')
        assert response.status_code == 401, (path, response.text)


def test_staff_cannot_manage_users_or_read_audit(client, db):
    create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'staffer')
    assert client.get(f'{API}/users').status_code == 403
    assert client.get(f'{API}/audit').status_code == 403
    response = client.post(f'{API}/users', headers=headers, json=user_payload('blocked'))
    assert response.status_code == 403
    assert db.query(User).filter(User.username == 'blocked').first() is None


def test_staff_cannot_promote_self(client, db):
    staff = create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'staffer')
    response = client.patch(f'{API}/users/{staff.id}/role', headers=headers, json={'role': 'owner'})
    assert response.status_code == 403
    assert db.query(User).filter(User.id == staff.id).first().role == 'staff'


def test_owner_can_create_user(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.post(f'{API}/users', headers=headers, json=user_payload('newstaff'))
    assert response.status_code == 201, response.text
    assert response.json()['role'] == 'staff'
    assert db.query(AuditLog).filter(AuditLog.action == 'USER_CREATED').first()


def test_user_creation_rejects_privilege_fields(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    payload = user_payload('attacker')
    payload['role'] = 'owner'
    payload['active'] = True
    response = client.post(f'{API}/users', headers=headers, json=payload)
    assert response.status_code == 422
    assert db.query(User).filter(User.username == 'attacker').first() is None


def test_weak_password_is_rejected_on_create(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.post(f'{API}/users', headers=headers, json=user_payload('weak', 'short'))
    assert response.status_code == 422


def test_duplicate_username_is_rejected(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.post(f'{API}/users', headers=headers, json=user_payload('OWNER'))
    assert response.status_code == 409


def test_last_owner_cannot_demote_or_deactivate_self(client, db):
    # The self-demotion guard and the last-owner invariant both protect this
    # case. The self guard is evaluated first and returns a clearer message.
    owner = create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    demote = client.patch(f'{API}/users/{owner.id}/role', headers=headers, json={'role': 'manager'})
    deactivate = client.patch(f'{API}/users/{owner.id}/status', headers=headers, json={'active': False})
    assert demote.status_code == 400
    assert deactivate.status_code == 400
    assert db.query(User).filter(User.id == owner.id).first().role == 'owner'


def test_inactive_owner_can_be_demoted_without_tripping_last_owner_guard(client, db):
    create_user(db, 'owner', 'owner')
    inactive_owner = create_user(db, 'retiredowner', 'owner', active=False)
    headers = csrf_headers(client, 'owner')
    response = client.patch(f'{API}/users/{inactive_owner.id}/role', headers=headers, json={'role': 'staff'})
    assert response.status_code == 200, response.text


def test_self_demotion_is_blocked(client, db):
    owner = create_user(db, 'owner', 'owner')
    create_user(db, 'secondowner', 'owner')
    headers = csrf_headers(client, 'owner')
    response = client.patch(f'{API}/users/{owner.id}/role', headers=headers, json={'role': 'manager'})
    assert response.status_code == 400


# --------------------------------------------------------------------------
# CSRF, origin validation and record-level effects
# --------------------------------------------------------------------------

def test_state_changes_require_csrf_and_trusted_origin(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    payload = user_payload('newstaff')

    assert client.post(f'{API}/users', json=payload).status_code == 403
    assert client.post(f'{API}/users', headers={'X-CSRF-Token': 'wrong'}, json=payload).status_code == 403
    assert client.post(f'{API}/users', headers={**headers, 'Origin': 'https://evil.test'}, json=payload).status_code == 403
    assert client.post(f'{API}/users', headers=headers, json=payload).status_code == 201


def test_deactivation_revokes_all_target_sessions(client, db):
    owner = create_user(db, 'owner', 'owner')
    staff = create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'owner')

    staff_client = TestClient(app)
    assert login(staff_client, 'staffer').status_code == 200
    assert staff_client.get(f'{API}/auth/me').status_code == 200

    response = client.patch(f'{API}/users/{staff.id}/status', headers=headers, json={'active': False})
    assert response.status_code == 200, response.text
    assert staff_client.get(f'{API}/auth/me').status_code == 401


def test_role_change_revokes_all_target_sessions(client, db):
    owner = create_user(db, 'owner', 'owner')
    staff = create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'owner')

    staff_client = TestClient(app)
    assert login(staff_client, 'staffer').status_code == 200

    response = client.patch(f'{API}/users/{staff.id}/role', headers=headers, json={'role': 'manager'})
    assert response.status_code == 200, response.text
    assert staff_client.get(f'{API}/auth/me').status_code == 401


def test_owner_can_revoke_suspicious_sessions(client, db):
    owner = create_user(db, 'owner', 'owner')
    staff = create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'owner')

    staff_client = TestClient(app)
    assert login(staff_client, 'staffer').status_code == 200
    response = client.post(f'{API}/users/{staff.id}/revoke-sessions', headers=headers)
    assert response.status_code == 204
    assert staff_client.get(f'{API}/auth/me').status_code == 401
    assert db.query(AuditLog).filter(AuditLog.action == 'SESSIONS_REVOKED').first()


# --------------------------------------------------------------------------
# API hardening
# --------------------------------------------------------------------------

def test_validation_errors_do_not_echo_secrets(client):
    secret = 'SUPERSECRETPAYLOAD' * 60
    response = client.post(f'{API}/auth/login', json={'username': 'someone', 'password': secret})
    assert response.status_code == 422
    assert secret not in response.text
    assert 'input' not in response.json()

    malformed = client.post(
        f'{API}/auth/login',
        content=b'{not valid json',
        headers={'Content-Type': 'application/json'},
    )
    assert malformed.status_code == 422
    assert 'not valid json' not in malformed.text


def test_oversized_request_body_is_rejected(client):
    response = client.post(f'{API}/auth/login', json={'username': 'x', 'password': 'a' * 1_100_000})
    assert response.status_code == 413


def test_security_headers_are_present(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert response.headers['X-Frame-Options'] == 'DENY'
    assert response.headers['Referrer-Policy'] == 'no-referrer'
    assert 'Content-Security-Policy' in response.headers

    api_response = client.get(f'{API}/auth/me')
    assert api_response.headers['Cache-Control'] == 'no-store'


def test_cors_does_not_allow_arbitrary_origins(client):
    response = client.options(
        f'{API}/auth/login',
        headers={'Origin': 'https://evil.test', 'Access-Control-Request-Method': 'POST'},
    )
    assert 'access-control-allow-origin' not in response.headers

    trusted = client.options(
        f'{API}/auth/login',
        headers={'Origin': 'http://testserver', 'Access-Control-Request-Method': 'POST'},
    )
    assert trusted.headers.get('access-control-allow-origin') == 'http://testserver'


def test_audit_log_is_owner_only_and_read_only(client, db):
    create_user(db, 'owner', 'owner')
    create_user(db, 'staffer', 'staff')
    headers = csrf_headers(client, 'owner')

    response = client.get(f'{API}/audit')
    assert response.status_code == 200
    assert any(entry['action'] == 'LOGIN_SUCCESS' for entry in response.json())

    assert client.put(f'{API}/audit', headers=headers, json={}).status_code == 405
    assert client.delete(f'{API}/audit', headers=headers).status_code == 405

    staff_client = TestClient(app)
    assert login(staff_client, 'staffer').status_code == 200
    assert staff_client.get(f'{API}/audit').status_code == 403


def test_audit_records_never_contain_passwords(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    assert client.post(f'{API}/users', headers=headers, json=user_payload('cleanuser')).status_code == 201
    entries = client.get(f'{API}/audit').json()
    assert all(VALID_PASSWORD not in str(entry) for entry in entries)


def test_user_supplied_text_is_json_not_html(client, db):
    create_user(db, 'owner', 'owner')
    headers = csrf_headers(client, 'owner')
    payload = user_payload('scriptuser')
    payload['name'] = '<script>alert(1)</script>'
    response = client.post(f'{API}/users', headers=headers, json=payload)
    assert response.status_code == 201
    assert response.headers['content-type'].startswith('application/json')
    assert response.json()['name'] == '<script>alert(1)</script>'


def test_production_configuration_disables_api_docs(monkeypatch):
    from backend.app import config as config_module

    monkeypatch.setattr(config_module.settings, 'environment', 'production')
    production_app = create_app()
    assert production_app.docs_url is None
    assert production_app.redoc_url is None
    assert production_app.openapi_url is None
