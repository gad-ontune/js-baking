"""Tamper-evident audit chain tests."""

from fastapi.testclient import TestClient

from backend.app.audit import verify_chain
from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuditLog, User
from backend.app.security import hash_password

API = '/api/v1'
PASSWORD = 'AuditPassword2040!'


def _make_user(username, role):
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


def _sign_in(client, username):
    response = client.post(f'{API}/auth/login', json={'username': username, 'password': PASSWORD})
    assert response.status_code == 200
    return {'X-CSRF-Token': response.json()['csrf_token']}


def test_audit_entries_form_a_consecutive_hash_chain(client):
    _make_user('owner', 'owner')
    for _ in range(3):
        _sign_in(TestClient(app), 'owner')

    db = SessionLocal()
    try:
        entries = db.query(AuditLog).order_by(AuditLog.sequence_number).all()
        assert len(entries) >= 3
        assert [entry.sequence_number for entry in entries] == list(range(1, len(entries) + 1))
        assert all(entry.previous_hash and entry.entry_hash for entry in entries)
        assert len({entry.entry_hash for entry in entries}) == len(entries)
        assert verify_chain(db) == {
            'valid': True, 'checked': len(entries), 'first_invalid_sequence': None,
        }
    finally:
        db.close()


def test_changing_an_audit_field_invalidates_the_chain(client):
    _make_user('owner', 'owner')
    _sign_in(client, 'owner')
    _sign_in(TestClient(app), 'owner')

    db = SessionLocal()
    try:
        target = db.query(AuditLog).filter(AuditLog.sequence_number == 1).one()
        target.details = 'tampered'
        db.commit()
        result = verify_chain(db)
        assert result['valid'] is False
        assert result['first_invalid_sequence'] == 1
    finally:
        db.close()


def test_verification_endpoint_is_owner_only(client):
    _make_user('owner', 'owner')
    _make_user('staff', 'staff')
    assert client.get(f'{API}/audit/verify').status_code == 401

    staff_headers = _sign_in(client, 'staff')
    assert client.get(f'{API}/audit/verify', headers=staff_headers).status_code == 403

    owner_client = TestClient(app)
    owner_headers = _sign_in(owner_client, 'owner')
    response = owner_client.get(f'{API}/audit/verify', headers=owner_headers)
    assert response.status_code == 200
    assert response.json()['valid'] is True
