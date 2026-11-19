"""Tests for the local demo business-record seeder."""

from backend.app.database import SessionLocal
from backend.app.models import BusinessRecord, User
from backend.app.security import hash_password
from backend.scripts.seed_business import seed_business_data


def test_seeder_creates_consistent_business_data():
    db = SessionLocal()
    try:
        actor = User(
            id='usr_owner', name='Owner', username='owner', email='owner@jsbaking.test',
            password_hash=hash_password('CorrectHorseBattery42'), role='owner', active=True,
        )
        db.add(actor)
        db.commit()

        counts = seed_business_data(db, actor)

        assert counts['inventory'] == 18
        assert counts['suppliers'] == 5
        assert counts['products'] == 8
        assert counts['purchases'] == 10
        assert counts['sales'] == 40
        assert counts['expenses'] == 18
        assert counts['production'] == 15
        # Opening stock, purchases and sales also generate movements internally.
        movement_count = db.query(BusinessRecord).filter(BusinessRecord.kind == 'movement').count()
        assert movement_count >= 30

        # All stock levels remain non-negative and every sale has a total.
        for record in db.query(BusinessRecord).filter(BusinessRecord.kind == 'inventory').all():
            assert record.payload['quantity'] >= 0
        for record in db.query(BusinessRecord).filter(BusinessRecord.kind == 'sale').all():
            assert record.payload['total'] >= 0
            assert record.payload['items']
    finally:
        db.close()
