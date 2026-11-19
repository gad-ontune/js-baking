"""Business-record API tests.

Covers RBAC, object-level ownership, server-computed stock and financial
effects, reversal-without-deletion, mass-assignment rejection and auditing.
"""

from fastapi.testclient import TestClient

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import AuditLog, BusinessRecord, User
from backend.app.security import hash_password

API = '/api/v1'
VALID_PASSWORD = 'CorrectHorseBattery42'


def make_user(username, role):
    db = SessionLocal()
    try:
        user = User(
            id=f'usr_{username}',
            name=username.title(),
            username=username,
            email=f'{username}@jsbaking.test',
            password_hash=hash_password(VALID_PASSWORD),
            role=role,
            active=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()


def sign_in(client, username):
    response = client.post(f'{API}/auth/login', json={'username': username, 'password': VALID_PASSWORD})
    assert response.status_code == 200, response.text
    return {'X-CSRF-Token': response.json()['csrf_token']}


def logged_in_client(username):
    """A client with its own cookie jar, so roles never share a CSRF cookie."""
    role_client = TestClient(app)
    return role_client, sign_in(role_client, username)


def inventory_payload(name='Flour', quantity=10):
    return {
        'name': name, 'code': f'INV-{name}', 'category': 'Baking Ingredients', 'unit': 'kg',
        'description': '', 'quantity': quantity, 'minQuantity': 2,
        'purchaseCost': 100, 'sellingPrice': None, 'expiryDate': '',
    }


def supplier_payload(name='Supplier A'):
    return {
        'name': name, 'businessName': 'A Ltd', 'phone': '0711000000',
        'email': 'a@jsbaking.test', 'location': 'Nairobi', 'description': '',
    }


def product_payload(name='Cake', tracked_item_id=None):
    return {
        'name': name, 'sku': f'PRD-{name}', 'category': 'Cakes', 'description': '',
        'cost': 50, 'price': 150, 'trackedItemId': tracked_item_id,
    }


def create_record(client, headers, kind, payload):
    response = client.post(f'{API}/business/{kind}', headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------
# Authentication and RBAC
# --------------------------------------------------------------------------

def test_business_endpoints_require_authentication(client):
    assert client.get(f'{API}/business/snapshot').status_code == 401
    assert client.get(f'{API}/business/inventory').status_code == 401
    # CSRF is checked before authentication for writes; either response denies access.
    assert client.post(f'{API}/business/inventory', json=inventory_payload()).status_code in (401, 403)


def test_snapshot_only_returns_collections_the_role_can_view(client):
    make_user('owner', 'owner')
    make_user('staff', 'staff')

    owner_client, owner_headers = logged_in_client('owner')
    owner_snapshot = owner_client.get(f'{API}/business/snapshot', headers=owner_headers).json()
    assert set(owner_snapshot) == {
        'inventory', 'movements', 'suppliers', 'products', 'purchases',
        'sales', 'expenses', 'production',
    }

    staff_client, staff_headers = logged_in_client('staff')
    staff_snapshot = staff_client.get(f'{API}/business/snapshot', headers=staff_headers).json()
    assert staff_snapshot['inventory'] == []
    assert staff_snapshot['sales'] == []
    # Sensitive collections are present but empty, never disclosed.
    assert staff_snapshot['purchases'] == []
    assert staff_snapshot['suppliers'] == []
    assert staff_client.get(f'{API}/business/purchase', headers=staff_headers).status_code == 403
    assert staff_client.get(f'{API}/business/supplier', headers=staff_headers).status_code == 403


def test_staff_cannot_create_suppliers_or_purchases(client):
    make_user('owner', 'owner')
    make_user('staff', 'staff')
    staff_client, staff_headers = logged_in_client('staff')

    supplier = staff_client.post(f'{API}/business/supplier', headers=staff_headers, json=supplier_payload())
    assert supplier.status_code == 403
    purchase = staff_client.post(f'{API}/business/purchase', headers=staff_headers, json={
        'supplierId': 'sup-1', 'date': '2026-01-01', 'items': [],
    })
    assert purchase.status_code == 403

    owner_client, owner_headers = logged_in_client('owner')
    supplier = create_record(owner_client, owner_headers, 'supplier', supplier_payload())
    assert supplier['status'] == 'Active'


def test_staff_can_manage_sales_and_expenses_but_not_settings(client):
    make_user('staff', 'staff')
    headers = sign_in(client, 'staff')
    expense = create_record(client, headers, 'expense', {
        'category': 'Electricity', 'description': 'Power bill', 'amount': 1200,
        'date': '2026-01-05', 'paymentMethod': 'Cash', 'notes': '',
    })
    assert expense['reference'].startswith('EXP-')
    assert expense['recordedBy'] == 'usr_staff'


# --------------------------------------------------------------------------
# Object-level ownership
# --------------------------------------------------------------------------

def test_staff_cannot_update_or_reverse_another_users_record(client):
    make_user('alice', 'staff')
    make_user('bob', 'staff')
    alice_client, alice_headers = logged_in_client('alice')
    bob_client, bob_headers = logged_in_client('bob')

    expense = create_record(alice_client, alice_headers, 'expense', {
        'category': 'Rent', 'description': 'Alice rent', 'amount': 500,
        'date': '2026-01-06', 'paymentMethod': 'Cash', 'notes': '',
    })

    # Bob cannot see that he owns it, so PATCH and reverse return 404.
    denied = bob_client.patch(
        f'{API}/business/expense/{expense["id"]}', headers=bob_headers,
        json={'amount': 1},
    )
    assert denied.status_code == 404
    reversed_denied = bob_client.post(
        f'{API}/business/expense/{expense["id"]}/reverse', headers=bob_headers,
        json={'reason': 'not mine'},
    )
    assert reversed_denied.status_code == 404

    # Alice can update and reverse her own record.
    updated = alice_client.patch(
        f'{API}/business/expense/{expense["id"]}', headers=alice_headers,
        json={'amount': 750},
    )
    assert updated.status_code == 200 and updated.json()['amount'] == 750
    reversed_ok = alice_client.post(
        f'{API}/business/expense/{expense["id"]}/reverse', headers=alice_headers,
        json={'reason': 'entered twice'},
    )
    assert reversed_ok.status_code == 200 and reversed_ok.json()['reversed'] is True


def test_manager_can_operate_on_any_staff_record(client):
    make_user('alice', 'staff')
    make_user('manager', 'manager')
    alice_client, alice_headers = logged_in_client('alice')
    expense = create_record(alice_client, alice_headers, 'expense', {
        'category': 'Water', 'description': 'Water bill', 'amount': 200,
        'date': '2026-01-07', 'paymentMethod': 'Cash', 'notes': '',
    })

    manager_client, manager_headers = logged_in_client('manager')
    response = manager_client.post(
        f'{API}/business/expense/{expense["id"]}/reverse', headers=manager_headers,
        json={'reason': 'duplicate entry'},
    )
    assert response.status_code == 200 and response.json()['reversed'] is True


# --------------------------------------------------------------------------
# Inventory and stock movements
# --------------------------------------------------------------------------

def test_inventory_movements_apply_server_computed_stock_changes(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=10))

    def move(movement_type, quantity, **extra):
        payload = {'type': movement_type, 'quantity': quantity, 'reason': 'test', 'reference': 'T-1', **extra}
        return client.post(f'{API}/business/inventory/{item["id"]}/movement', headers=headers, json=payload)

    purchase = move('Purchase', 5)
    assert purchase.status_code == 200, purchase.text
    assert purchase.json()['item']['quantity'] == 15
    assert purchase.json()['movement']['previousQuantity'] == 10
    assert purchase.json()['movement']['newQuantity'] == 15

    sale = move('Sale', 3)
    assert sale.status_code == 200 and sale.json()['item']['quantity'] == 12

    adjustment = move('Adjustment', 20)
    assert adjustment.status_code == 200 and adjustment.json()['item']['quantity'] == 20
    assert adjustment.json()['movement']['quantity'] == 8

    negative = move('Wastage', 999)
    assert negative.status_code == 409

    movements = client.get(f'{API}/business/movement', headers=headers).json()
    assert len(movements) == 4  # opening stock + three applied changes
    # Movements are listed newest first (reverse chronological by date).
    assert [movement['newQuantity'] for movement in movements] == [20, 12, 15, 10]


def test_inventory_update_cannot_change_quantity_directly(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=10))

    response = client.patch(
        f'{API}/business/inventory/{item["id"]}', headers=headers,
        json={'name': 'Flour (refined)', 'quantity': 999},
    )
    assert response.status_code == 422
    unchanged = client.get(f'{API}/business/inventory', headers=headers).json()[0]
    assert unchanged['quantity'] == 10


# --------------------------------------------------------------------------
# Purchases
# --------------------------------------------------------------------------

def _setup_purchase(client, headers):
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=10))
    supplier = create_record(client, headers, 'supplier', supplier_payload())
    body = {
        'supplierId': supplier['id'],
        'date': '2026-02-01T10:00:00',
        'items': [{'itemId': item['id'], 'quantity': 5, 'unitCost': 120}],
        'discount': 50,
        'charges': 100,
        'paymentMethod': 'Cash',
        'notes': '',
    }
    return item, supplier, body


def test_purchase_uses_server_computed_totals_and_updates_stock(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item, supplier, body = _setup_purchase(client, headers)

    tampered = {**body, 'paidAmount': 999999, 'total': 1}
    created = client.post(f'{API}/business/purchase', headers=headers, json=tampered)
    assert created.status_code == 422, 'mass-assigned fields must be rejected'

    purchase = create_record(client, headers, 'purchase', body)
    assert purchase['subtotal'] == 600
    assert purchase['total'] == 650
    assert purchase['paidAmount'] == 0
    assert purchase['balance'] == 650
    assert purchase['status'] == 'Unpaid'
    assert purchase['items'][0]['name'] == 'Flour'
    assert purchase['createdBy'] == 'usr_owner'

    stock = client.get(f'{API}/business/inventory', headers=headers).json()
    assert stock[0]['quantity'] == 15


def test_payment_updates_balance_and_is_limited_to_outstanding_amount(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    _item, _supplier, body = _setup_purchase(client, headers)
    purchase = create_record(client, headers, 'purchase', body)

    too_much = client.post(
        f'{API}/business/purchase/{purchase["id"]}/payment', headers=headers,
        json={'amount': 1000, 'method': 'M-Pesa'},
    )
    assert too_much.status_code == 422

    partial = client.post(
        f'{API}/business/purchase/{purchase["id"]}/payment', headers=headers,
        json={'amount': 200, 'date': '2026-02-02', 'method': 'M-Pesa'},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()['paidAmount'] == 200
    assert partial.json()['balance'] == 450
    assert partial.json()['status'] == 'Partially paid'
    assert len(partial.json()['payments']) == 1

    final = client.post(
        f'{API}/business/purchase/{purchase["id"]}/payment', headers=headers,
        json={'amount': 450, 'method': 'Cash'},
    )
    assert final.json()['status'] == 'Paid' and final.json()['balance'] == 0


def test_purchase_reversal_reverses_stock_and_preserves_history(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item, _supplier, body = _setup_purchase(client, headers)
    purchase = create_record(client, headers, 'purchase', body)

    reversed_record = client.post(
        f'{API}/business/purchase/{purchase["id"]}/reverse', headers=headers,
        json={'reason': 'supplier returned the delivery'},
    )
    assert reversed_record.status_code == 200, reversed_record.text
    assert reversed_record.json()['voided'] is True
    assert reversed_record.json()['status'] == 'Voided'

    purchases = client.get(f'{API}/business/purchase', headers=headers).json()
    assert len(purchases) == 1 and purchases[0]['voided'] is True
    stock = client.get(f'{API}/business/inventory', headers=headers).json()
    assert stock[0]['quantity'] == 10

    # A second reversal is rejected; records are never deleted.
    again = client.post(
        f'{API}/business/purchase/{purchase["id"]}/reverse', headers=headers,
        json={'reason': 'again'},
    )
    assert again.status_code == 409
    assert client.delete(f'{API}/business/purchase/{purchase["id"]}', headers=headers).status_code == 405


# --------------------------------------------------------------------------
# Sales
# --------------------------------------------------------------------------

def test_sale_decreases_stock_and_creates_new_products_server_side(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=10))
    product = create_record(client, headers, 'product', product_payload(tracked_item_id=item['id']))

    body = {
        'date': '2026-03-01T12:00:00',
        'items': [
            {'productId': product['id'], 'quantity': 3, 'unitPrice': 200},
            {'productId': None, 'productName': 'Custom Tart', 'quantity': 1, 'unitPrice': 350},
        ],
        'discount': 50,
        'paymentMethod': 'M-Pesa',
        'notes': '',
        'total': 1,  # mass assignment attempt
    }
    rejected = client.post(f'{API}/business/sale', headers=headers, json=body)
    assert rejected.status_code == 422
    body.pop('total')

    sale = create_record(client, headers, 'sale', body)
    assert sale['subtotal'] == 950
    assert sale['total'] == 900
    assert sale['cost'] == 150
    assert sale['createdBy'] == 'usr_owner'

    stock = client.get(f'{API}/business/inventory', headers=headers).json()
    assert stock[0]['quantity'] == 7

    products = client.get(f'{API}/business/product', headers=headers).json()
    assert any(entry['name'] == 'Custom Tart' for entry in products)

    voided = client.post(
        f'{API}/business/sale/{sale["id"]}/reverse', headers=headers,
        json={'reason': 'customer returned the cake'},
    )
    assert voided.status_code == 200 and voided.json()['voided'] is True
    stock = client.get(f'{API}/business/inventory', headers=headers).json()
    assert stock[0]['quantity'] == 10


def test_sale_cannot_oversell_tracked_stock(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=2))
    product = create_record(client, headers, 'product', product_payload(tracked_item_id=item['id']))

    response = client.post(f'{API}/business/sale', headers=headers, json={
        'date': '2026-03-02',
        'items': [{'productId': product['id'], 'quantity': 5, 'unitPrice': 200}],
        'discount': 0, 'paymentMethod': 'Cash', 'notes': '',
    })
    assert response.status_code == 409
    assert 'stock' in response.json()['detail'].lower()
    assert client.get(f'{API}/business/inventory', headers=headers).json()[0]['quantity'] == 2


# --------------------------------------------------------------------------
# CSRF and audit
# --------------------------------------------------------------------------

def test_csrf_required_for_business_writes(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    no_csrf = client.post(f'{API}/business/expense', json={
        'category': 'Rent', 'description': 'No token', 'amount': 10,
        'date': '2026-04-01', 'paymentMethod': 'Cash', 'notes': '',
    })
    assert no_csrf.status_code == 403

    with_csrf = client.post(f'{API}/business/expense', headers=headers, json={
        'category': 'Rent', 'description': 'With token', 'amount': 10,
        'date': '2026-04-01', 'paymentMethod': 'Cash', 'notes': '',
    })
    assert with_csrf.status_code == 201


def test_business_actions_write_append_only_audit_records(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    item = create_record(client, headers, 'inventory', inventory_payload(quantity=5))
    client.post(f'{API}/business/inventory/{item["id"]}/movement', headers=headers, json={
        'type': 'Purchase', 'quantity': 2, 'reason': 'delivery', 'reference': 'REC-1',
    })

    db = SessionLocal()
    try:
        actions = [entry.action for entry in db.query(AuditLog).all()]
        assert 'INVENTORY_CREATED' in actions
        assert 'STOCK_MOVEMENT' in actions
        assert 'LOGIN_SUCCESS' in actions
    finally:
        db.close()


def test_business_records_are_persisted_as_typed_json(client):
    make_user('owner', 'owner')
    headers = sign_in(client, 'owner')
    created = create_record(client, headers, 'expense', {
        'category': 'Internet', 'description': 'Fibre', 'amount': 3500,
        'date': '2026-04-02', 'paymentMethod': 'Bank Transfer', 'notes': 'monthly',
    })

    db = SessionLocal()
    try:
        record = db.query(BusinessRecord).filter(BusinessRecord.id == created['id']).first()
        assert record is not None
        assert record.kind == 'expense'
        assert record.payload['amount'] == 3500
        assert record.created_by == 'usr_owner'
    finally:
        db.close()
