"""Tests for the dev-only demo account seeding script."""

import os

from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.models import BusinessRecord, User
from backend.app.security import password_policy_error
from backend.scripts import seed_demo


def test_demo_passwords_satisfy_the_backend_policy():
    assert len(seed_demo.DEMO_ACCOUNTS) == 3
    for _name, username, _email, password, _role, _env in seed_demo.DEMO_ACCOUNTS:
        assert username in {'amina', 'brian', 'wanjiku'}
        assert password_policy_error(password) is None, username


def test_demo_seed_refuses_production_by_default(monkeypatch):
    monkeypatch.setattr(settings, 'environment', 'production')
    monkeypatch.delenv('JSBH_ALLOW_DEMO_SEED', raising=False)
    assert seed_demo.main() == 2
    db = SessionLocal()
    try:
        assert db.query(User).count() == 0
    finally:
        db.close()


def test_demo_seed_creates_all_roles(monkeypatch):
    monkeypatch.setattr(settings, 'environment', 'development')
    assert seed_demo.main() == 0

    db = SessionLocal()
    try:
        users = {user.username: user.role for user in db.query(User).all()}
        assert users == {'amina': 'owner', 'brian': 'staff', 'wanjiku': 'manager'}

        # One command must also prepare a complete, useful business dataset.
        assert db.query(BusinessRecord).count() > 100
        inventory = [
            record.payload for record in db.query(BusinessRecord)
            .filter(BusinessRecord.kind == 'inventory').all()
        ]
        assert any(item['expiryDate'] for item in inventory)
        assert any(item['quantity'] <= item['minQuantity'] for item in inventory)

        # A second run must not reset existing accounts, passwords or records.
        before = db.query(BusinessRecord).count()
        assert seed_demo.main() == 0
        assert {user.username: user.role for user in db.query(User).all()} == users
        assert db.query(BusinessRecord).count() == before
    finally:
        db.close()
