"""Populate the business-record API with realistic local demo data.

This script is for isolated development/demo deployments only. It creates
inventory, suppliers, products, purchases, sales, expenses, production records
and stock movements *through the same service layer the API uses*, so the data
is internally consistent and all totals and stock effects are server-computed.

Run `seed_demo.py` first so an owner account exists to attribute records to.

Usage (from the repository root):

    backend/.venv/bin/python backend/scripts/seed_business.py

The script is idempotent: it does nothing if business records already exist.
It refuses to run in production unless JSBH_ALLOW_DEMO_SEED=true is set.
"""

import os
import random
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app import business  # noqa: E402
from backend.app.config import settings  # noqa: E402
from backend.app.database import SessionLocal, init_db  # noqa: E402
from backend.app.models import BusinessRecord, User  # noqa: E402
from backend.app.security import utc_now  # noqa: E402

# Deterministic demo data only — never used for tokens, passwords or secrets.
rng = random.Random(20261118)  # nosec B311


class _InternalRequest:
    """Minimal request stand-in for audit records created by the seeder."""

    headers: dict = {}
    client = None


REQUEST = _InternalRequest()

SUPPLIERS = [
    ('Kamau Agro Supplies', 'Kamau Agro Ltd', '0722 418 990', 'orders@kamauagro.co.ke', 'Kikuyu, Kiambu', 'Flour, sugar and baking ingredients'),
    ('Lakeview Produce', 'Lakeview Produce Co.', '0733 620 114', 'sales@lakeviewproduce.co.ke', 'Nakuru', 'Fresh fruits and juice ingredients'),
    ('PackRight Kenya', 'PackRight Solutions', '0711 882 430', 'hello@packright.co.ke', 'Industrial Area, Nairobi', 'Cake boxes, bottles and labels'),
    ('Mama Mboga Foods', 'Mama Mboga Enterprises', '0705 227 881', '', 'Kisumu', 'Dairy, eggs and fresh produce'),
    ('Sweet Treats Depot', 'Sweet Treats Depot', '0728 991 220', 'supply@sweettreats.co.ke', 'Eastleigh, Nairobi', 'Chocolate and specialty items'),
]

# name, category, unit, opening quantity, min quantity, purchase cost, selling price
INVENTORY = [
    ('Flour', 'Baking Ingredients', 'kg', 120, 12, 145, None),
    ('Sugar', 'Baking Ingredients', 'kg', 90, 10, 160, None),
    ('Eggs', 'Baking Ingredients', 'Pieces', 420, 40, 18, None),
    ('Butter', 'Baking Ingredients', 'kg', 36, 8, 520, None),
    ('Milk', 'Baking Ingredients', 'L', 70, 8, 120, None),
    ('Cocoa powder', 'Baking Ingredients', 'kg', 18, 3, 760, None),
    ('Chocolate', 'Baking Ingredients', 'kg', 22, 3, 820, None),
    ('Mangoes', 'Fruits & Juice Ingredients', 'kg', 80, 10, 180, None),
    ('Passion fruits', 'Fruits & Juice Ingredients', 'kg', 40, 6, 320, None),
    ('Cake boxes', 'Packaging Materials', 'Pieces', 260, 30, 45, None),
    ('Juice bottles', 'Packaging Materials', 'Bottles', 380, 50, 35, None),
    ('Cups', 'Packaging Materials', 'Pieces', 600, 80, 8, None),
    ('Cleaning detergent', 'Cleaning & Supplies', 'Bottles', 24, 3, 260, None),
    ('Cakes', 'Finished Products', 'Pieces', 600, 4, 1800, 3200),
    ('Cupcakes', 'Finished Products', 'Pieces', 900, 12, 110, 260),
    ('Cake slices', 'Finished Products', 'Pieces', 700, 8, 220, 450),
    ('Fresh juices', 'Finished Products', 'L', 500, 6, 280, 620),
    ('Bottled juices', 'Finished Products', 'Bottles', 900, 20, 120, 280),
]

# product name, category, cost, price, linked inventory item
PRODUCTS = [
    ('Birthday Cake', 'Cakes', 1800, 3200, 'Cakes'),
    ('Chocolate Cake', 'Cakes', 1950, 3400, 'Cakes'),
    ('Cupcake', 'Cupcakes', 110, 260, 'Cupcakes'),
    ('Cake Slice', 'Cake Slices', 220, 450, 'Cake slices'),
    ('Mango Juice', 'Fresh Juices', 280, 620, 'Fresh juices'),
    ('Passion Juice', 'Fresh Juices', 300, 650, 'Fresh juices'),
    ('Bottled Mango Juice', 'Bottled Juices', 120, 280, 'Bottled juices'),
    ('Bottled Passion Juice', 'Bottled Juices', 130, 300, 'Bottled juices'),
]

EXPENSES = [
    ('Rent', 'Monthly bakery premises rent', 42000),
    ('Salaries & Wages', 'Staff wages — weekly', 28500),
    ('Electricity', 'KPLC electricity bill', 9400),
    ('Water', 'Water bill', 2600),
    ('Internet', 'Business fibre connection', 3500),
    ('Transport', 'Delivery and collection transport', 1800),
    ('Cleaning Supplies', 'Cleaning materials', 1400),
    ('Repairs & Maintenance', 'Oven servicing', 7500),
]

PRODUCTION = [
    ('Birthday Cake', 'Cakes', 3),
    ('Cupcake', 'Cupcakes', 24),
    ('Cake Slice', 'Cake Slices', 12),
    ('Mango Juice', 'Fresh Juices', 18),
    ('Bottled Mango Juice', 'Bottled Juices', 36),
]


def _date(days_ago: int, hour: int = 9) -> str:
    value = utc_now() - timedelta(days=days_ago)
    return value.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def seed_business_data(db, actor: User) -> dict[str, int]:
    """Seed demo business records. Returns a count per record kind."""
    counts = {key: 0 for key in business.COLLECTION_KEYS.values()}

    def create(kind: str, payload: dict):
        record = business.create_record(db, REQUEST, actor, kind, payload)
        counts[business.COLLECTION_KEYS[kind]] += 1
        return record

    supplier_ids = []
    for name, business_name, phone, email, location, description in SUPPLIERS:
        supplier = create('supplier', {
            'name': name, 'businessName': business_name, 'phone': phone,
            'email': email, 'location': location, 'description': description,
        })
        supplier_ids.append(supplier['id'])

    inventory_ids: dict[str, str] = {}
    for name, category, unit, quantity, minimum, cost, price in INVENTORY:
        item = create('inventory', {
            'name': name, 'code': f'INV-{len(inventory_ids) + 1:04d}',
            'category': category, 'description': f'{name} — {category.lower()}',
            'unit': unit, 'quantity': quantity, 'minQuantity': minimum,
            'purchaseCost': cost, 'sellingPrice': price, 'expiryDate': '',
        })
        inventory_ids[name] = item['id']

    product_ids: dict[str, str] = {}
    for name, category, cost, price, tracked in PRODUCTS:
        product = create('product', {
            'name': name, 'sku': f'PRD-{len(product_ids) + 1:03d}',
            'category': category, 'description': f'{name} — {category}',
            'cost': cost, 'price': price, 'trackedItemId': inventory_ids[tracked],
        })
        product_ids[name] = product['id']

    for index in range(10):
        supplier_id = supplier_ids[index % len(supplier_ids)]
        lines = []
        for name in rng.sample(['Flour', 'Sugar', 'Milk', 'Mangoes', 'Eggs', 'Cake boxes'], k=2):
            lines.append({
                'itemId': inventory_ids[name],
                'quantity': rng.randint(5, 25),
                'unitCost': next(row[5] for row in INVENTORY if row[0] == name),
            })
        create('purchase', {
            'supplierId': supplier_id,
            'date': _date(28 - index * 3, 8),
            'items': lines,
            'discount': rng.choice([0, 0, 500, 1000]),
            'charges': rng.choice([0, 0, 250]),
            'notes': 'Demo supplier delivery',
        })

    product_names = list(product_ids)
    for index in range(40):
        chosen = rng.sample(product_names, k=rng.randint(1, 2))
        lines = []
        for name in chosen:
            product_price = next(row[3] for row in PRODUCTS if row[0] == name)
            lines.append({
                'productId': product_ids[name],
                'quantity': rng.randint(1, 3),
                'unitPrice': product_price,
            })
        create('sale', {
            'date': _date(30 - index, rng.randint(8, 17)),
            'items': lines,
            'discount': rng.choice([0, 0, 0, 100]),
            'paymentMethod': rng.choice(['Cash', 'M-Pesa', 'Bank Transfer']),
            'notes': 'Demo sale',
        })

    for index in range(18):
        category, description, amount = EXPENSES[index % len(EXPENSES)]
        create('expense', {
            'category': category,
            'description': description,
            'amount': round(amount * rng.uniform(0.85, 1.15)),
            'date': _date(30 - index, rng.randint(8, 17)),
            'paymentMethod': rng.choice(['Cash', 'M-Pesa', 'Bank Transfer']),
            'notes': '',
        })

    for index in range(15):
        name, category, base = PRODUCTION[index % len(PRODUCTION)]
        create('production', {
            'productName': name,
            'category': category,
            'quantity': max(1, round(base * rng.uniform(0.7, 1.3))),
            'date': _date(29 - index, rng.randint(6, 14)),
            'description': f'{name} prepared for daily sales',
            'notes': '',
        })

    # A few audited corrections keep low-stock and expiry alerts realistic.
    for name, movement_type, quantity, reason in [
        ('Butter', 'Wastage', 3, 'Spoiled stock written off'),
        ('Passion fruits', 'Wastage', 2, 'Overripe fruit discarded'),
        ('Cake slices', 'Adjustment', 40, 'End-of-day finished stock count'),
        ('Juice bottles', 'Adjustment', 500, 'Stock count correction after delivery'),
    ]:
        movement = business.record_movement(db, REQUEST, actor, inventory_ids[name], {
            'type': movement_type, 'quantity': quantity,
            'reason': reason, 'reference': f'DEMO-{movement_type[:3].upper()}',
        })
        counts['movements'] += 1
        if movement['item']['quantity'] < 0:
            raise RuntimeError(f'Demo seed produced negative stock for {name}.')

    return counts


def main() -> int:
    if settings.is_production and os.environ.get('JSBH_ALLOW_DEMO_SEED', '').lower() != 'true':
        print(
            'Refusing to seed demo business records in production. '
            'Set JSBH_ALLOW_DEMO_SEED=true only for an isolated demo deployment.',
            file=sys.stderr,
        )
        return 2

    init_db()
    db = SessionLocal()
    try:
        if db.query(BusinessRecord).count():
            print('Business records already exist; nothing to seed.')
            return 0
        actor = db.query(User).filter(User.role == 'owner', User.active.is_(True)).first()
        if not actor:
            print('No active owner found. Run seed_demo.py first.', file=sys.stderr)
            return 2

        counts = seed_business_data(db, actor)
        print('Seeded demo business records: ' + ', '.join(
            f'{key}={value}' for key, value in counts.items() if value
        ))
        print('These records are for local development only. Never deploy them.')
        return 0
    finally:
        db.close()


if __name__ == '__main__':
    raise SystemExit(main())
