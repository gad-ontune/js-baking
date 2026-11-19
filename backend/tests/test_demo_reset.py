"""Tests for the owner-only demo data reset endpoint."""

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuditLog, BusinessRecord, User
from backend.app.security import hash_password
from backend.scripts.seed_business import seed_business_data

API = '/api/v1'
PASSWORD = 'CorrectHorseBattery42'


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


def _signed_in_client(username):
    client = TestClient(app)
    response = client.post(f'{API}/auth/login', json={'username': username, 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return client, {'X-CSRF-Token': response.json()['csrf_token']}


def test_demo_reset_is_owner_only_and_requires_csrf(client):
    _make_user('owner', 'owner')
    _make_user('staff', 'staff')

    assert client.post(f'{API}/business/demo/reset', json={}).status_code in (401, 403)

    staff, staff_headers = _signed_in_client('staff')
    assert staff.post(
        f'{API}/business/demo/reset', headers=staff_headers, json={},
    ).status_code == 403

    owner, owner_headers = _signed_in_client('owner')
    assert owner.post(f'{API}/business/demo/reset', json={}).status_code == 403
    assert owner.post(
        f'{API}/business/demo/reset', headers=owner_headers, json={},
    ).status_code == 200


def test_demo_reset_rebuilds_records_and_writes_audit_event(client):
    _make_user('owner', 'owner')
    owner, headers = _signed_in_client('owner')

    db = SessionLocal()
    try:
        actor = db.query(User).filter(User.username == 'owner').one()
        seed_business_data(db, actor)
        db.commit()
        assert db.query(BusinessRecord).count() > 100
    finally:
        db.close()

    response = owner.post(f'{API}/business/demo/reset', headers=headers, json={})
    assert response.status_code == 200, response.text
    snapshot = response.json()
    assert len(snapshot['inventory']) > 10
    assert any(item['expiryDate'] for item in snapshot['inventory'])

    db = SessionLocal()
    try:
        audit = db.query(AuditLog).filter(AuditLog.action == 'DEMO_DATA_RESTORED').one()
        assert audit.user_id == 'usr_owner'
        assert audit.outcome == 'success'
    finally:
        db.close()


def test_demo_reset_is_hidden_in_production(client, monkeypatch):
    _make_user('owner', 'owner')
    owner, headers = _signed_in_client('owner')
    monkeypatch.setattr(settings, 'environment', 'production')
    monkeypatch.delenv('JSBH_ALLOW_DEMO_SEED', raising=False)
    response = owner.post(f'{API}/business/demo/reset', headers=headers, json={})
    assert response.status_code == 404
