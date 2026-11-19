"""Business-record service.

Every stock or financial change is validated here, on the server, before it is
written. The SPA is a presentation layer only: it cannot set totals, stock
levels, references, creator fields or reversal state directly.

Design notes
------------
* Payloads are validated with strict Pydantic models (extra fields rejected),
  so a client cannot mass-assign server-owned fields.
* Object-level authorisation: staff may only update or reverse records they
  created. Managers and owners may act on any record.
* Reversal is the only way to cancel a financial record — there is no DELETE
  path, so history is always preserved.
* Stock movements are derived from the movement type and applied atomically
  with the parent record; a resulting negative balance is rejected.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from .audit import record_audit
from .auth import ROLE_PERMISSIONS
from .models import BusinessRecord, User
from .schemas import (
    ExpenseCreate,
    ExpenseUpdate,
    InventoryCreate,
    InventoryUpdate,
    MovementCreate,
    PaymentCreate,
    ProductionCreate,
    ProductionUpdate,
    ProductCreate,
    ProductUpdate,
    PurchaseCreate,
    PurchaseUpdate,
    SaleCreate,
    SupplierCreate,
    SupplierUpdate,
)
from .security import new_id, utc_now

# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

KIND_SPECS: dict[str, dict[str, str]] = {
    'inventory': {'view': 'inventory.view', 'manage': 'inventory.manage', 'entity': 'Inventory'},
    'movement': {'view': 'inventory.view', 'manage': 'inventory.manage', 'entity': 'Inventory'},
    'supplier': {'view': 'suppliers.view', 'manage': 'purchases.manage', 'entity': 'Supplier'},
    'product': {'view': 'sales.view', 'manage': 'sales.manage', 'entity': 'Product'},
    'purchase': {'view': 'purchases.view', 'manage': 'purchases.manage', 'entity': 'Purchase'},
    'sale': {'view': 'sales.view', 'manage': 'sales.manage', 'entity': 'Sale'},
    'expense': {'view': 'expenses.view', 'manage': 'expenses.manage', 'entity': 'Expense'},
    'production': {'view': 'production.view', 'manage': 'production.manage', 'entity': 'Production'},
}

CREATE_SCHEMAS: dict[str, type[BaseModel]] = {
    'inventory': InventoryCreate,
    'supplier': SupplierCreate,
    'product': ProductCreate,
    'purchase': PurchaseCreate,
    'sale': SaleCreate,
    'expense': ExpenseCreate,
    'production': ProductionCreate,
}

UPDATE_SCHEMAS: dict[str, type[BaseModel]] = {
    'inventory': InventoryUpdate,
    'supplier': SupplierUpdate,
    'product': ProductUpdate,
    'purchase': PurchaseUpdate,
    'expense': ExpenseUpdate,
    'production': ProductionUpdate,
}

CREATE_ACTIONS = {
    'inventory': 'INVENTORY_CREATED',
    'supplier': 'SUPPLIER_CREATED',
    'product': 'PRODUCT_CREATED',
    'purchase': 'PURCHASE_CREATED',
    'sale': 'SALE_RECORDED',
    'expense': 'EXPENSE_RECORDED',
    'production': 'PRODUCTION_CREATED',
}

REVERSE_ACTIONS = {
    'purchase': 'PURCHASE_VOIDED',
    'sale': 'SALE_VOIDED',
    'expense': 'EXPENSE_REVERSED',
    'production': 'PRODUCTION_REVERSED',
}

COLLECTION_KEYS = {
    'inventory': 'inventory',
    'movement': 'movements',
    'supplier': 'suppliers',
    'product': 'products',
    'purchase': 'purchases',
    'sale': 'sales',
    'expense': 'expenses',
    'production': 'production',
}

PREFIXES = {
    'inventory': 'inv-',
    'movement': 'mov-',
    'supplier': 'sup-',
    'product': 'prod-',
    'purchase': 'pur-',
    'sale': 'sal-',
    'expense': 'exp-',
    'production': 'prd-',
}

SNAPSHOT_KINDS = tuple(KIND_SPECS)


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def has_permission(user: User, permission: str) -> bool:
    allowed = ROLE_PERMISSIONS.get(user.role, set())
    return '*' in allowed or permission in allowed


def ensure_permission(user: User, permission: str) -> None:
    if not has_permission(user, permission):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Permission denied.')


def ensure_owner(record: BusinessRecord, actor: User) -> None:
    """Staff own only what they created; managers and owners own everything.

    A 404 (rather than 403) avoids disclosing the existence of another user's
    financial record.
    """
    if actor.role != 'staff':
        return
    if record.created_by != actor.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Record not found.')


def _now() -> str:
    return utc_now().isoformat()


def _get(db: Session, kind: str, record_id: str) -> BusinessRecord:
    record = db.query(BusinessRecord).filter(
        BusinessRecord.id == record_id,
        BusinessRecord.kind == kind,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Record not found.')
    return record


def _new_record(db: Session, kind: str, payload: dict[str, Any], actor: User) -> BusinessRecord:
    record_id = new_id(PREFIXES[kind])
    record = BusinessRecord(
        id=record_id,
        kind=kind,
        payload={**payload, 'id': record_id},
        created_by=actor.id,
    )
    db.add(record)
    return record


def _validate(schema: type[BaseModel], body: dict[str, Any]) -> BaseModel:
    try:
        return schema.model_validate(body)
    except ValidationError as exc:
        # Field names and messages only — never echo submitted values, which
        # may contain sensitive business data.
        errors = [
            {'field': '.'.join(str(part) for part in error['loc']), 'message': error['msg']}
            for error in exc.errors()
        ]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={'message': 'Invalid request.', 'errors': errors},
        ) from exc


def _reference(db: Session, kind: str, prefix: str, width: int = 3) -> str:
    count = db.query(BusinessRecord).filter(BusinessRecord.kind == kind).count() + 1
    return f'{prefix}-{datetime.now().year}-{count:0{width}d}'


def _audit(
    db: Session,
    request: Request,
    actor: User,
    action: str,
    entity: str,
    record_id: str,
    details: str,
    **extra: Any,
) -> None:
    record_audit(
        db,
        request,
        event_type='BUSINESS',
        action=action,
        entity=entity,
        entity_id=record_id,
        user_id=actor.id,
        details=details,
        commit=False,
        **extra,
    )


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def _sort_key(record: BusinessRecord) -> str:
    payload = record.payload
    return str(payload.get('date') or payload.get('createdAt') or record.created_at.isoformat())


def list_records(db: Session, kind: str, actor: User) -> list[dict[str, Any]]:
    spec = KIND_SPECS.get(kind)
    if not spec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Unknown record type.')
    ensure_permission(actor, spec['view'])
    records = db.query(BusinessRecord).filter(BusinessRecord.kind == kind).all()
    records.sort(key=_sort_key, reverse=True)
    return [record.payload for record in records]


def snapshot(db: Session, actor: User) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for kind in SNAPSHOT_KINDS:
        key = COLLECTION_KEYS[kind]
        if has_permission(actor, KIND_SPECS[kind]['view']):
            records = db.query(BusinessRecord).filter(BusinessRecord.kind == kind).all()
            records.sort(key=_sort_key, reverse=True)
            result[key] = [record.payload for record in records]
        else:
            # Keep the shape stable so the SPA does not need role-aware code.
            result[key] = []
    return result


# ---------------------------------------------------------------------------
# Stock effects
# ---------------------------------------------------------------------------

def _insert_movement(
    db: Session,
    actor: User,
    item_id: str,
    movement_type: str,
    quantity: float,
    previous: float,
    new: float,
    date: str,
    reason: str,
    reference: str,
) -> BusinessRecord:
    payload = {
        'itemId': item_id,
        'type': movement_type,
        'quantity': round(quantity, 2),
        'previousQuantity': round(previous, 2),
        'newQuantity': round(new, 2),
        'date': date,
        'userId': actor.id,
        'reason': reason,
        'reference': reference,
        'createdAt': date,
    }
    return _new_record(db, 'movement', payload, actor)


def _apply_stock(
    db: Session,
    actor: User,
    item_id: str,
    delta: float,
    date: str,
    movement_type: str,
    reason: str,
    reference: str,
) -> BusinessRecord:
    item = _get(db, 'inventory', item_id)
    previous = round(float(item.payload['quantity']), 2)
    new = round(previous + float(delta), 2)
    if new < 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Insufficient stock for {item.payload["name"]}.',
        )
    item.payload = {**item.payload, 'quantity': new, 'updatedAt': date}
    return _insert_movement(
        db, actor, item_id, movement_type, delta, previous, new, date, reason, reference,
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def _create_inventory(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(InventoryCreate, body).model_dump()
    now = _now()
    payload = {**data, 'archived': False, 'createdAt': now, 'updatedAt': now}
    record = _new_record(db, 'inventory', payload, actor)
    quantity = float(data['quantity'] or 0)
    if quantity > 0:
        _insert_movement(
            db, actor, record.id, 'Opening Stock', quantity, 0, quantity, now,
            'Opening stock entered with new item', _reference(db, 'movement', 'REF', 6),
        )
    _audit(db, request, actor, CREATE_ACTIONS['inventory'], 'Inventory', record.id, f'{data["name"]} added to inventory')
    return record


def _create_supplier(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(SupplierCreate, body).model_dump()
    record = _new_record(db, 'supplier', {**data, 'status': 'Active', 'createdAt': _now()}, actor)
    _audit(db, request, actor, CREATE_ACTIONS['supplier'], 'Supplier', record.id, f'{data["name"]} added to suppliers')
    return record


def _create_product(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(ProductCreate, body).model_dump()
    record = _new_record(db, 'product', {**data, 'archived': False, 'createdAt': _now()}, actor)
    _audit(db, request, actor, CREATE_ACTIONS['product'], 'Product', record.id, f'{data["name"]} added to catalogue')
    return record


def _create_purchase(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(PurchaseCreate, body).model_dump()
    supplier = _get(db, 'supplier', data['supplierId'])

    lines: list[dict[str, Any]] = []
    for entry in data['items']:
        item = _get(db, 'inventory', entry['itemId'])
        quantity = float(entry['quantity'])
        unit_cost = float(entry['unitCost'])
        lines.append({
            'itemId': item.id,
            'name': item.payload['name'],
            'unit': item.payload['unit'],
            'quantity': quantity,
            'unitCost': unit_cost,
            'subtotal': round(quantity * unit_cost, 2),
        })

    subtotal = round(sum(line['subtotal'] for line in lines), 2)
    discount = float(data['discount'] or 0)
    charges = float(data['charges'] or 0)
    if subtotal - discount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Discount cannot exceed the subtotal.')
    total = round(subtotal - discount + charges, 2)

    reference = _reference(db, 'purchase', 'PUR')
    now = _now()
    payload = {
        'reference': reference,
        'supplierId': supplier.id,
        'date': data['date'],
        'items': lines,
        'subtotal': subtotal,
        'discount': discount,
        'charges': charges,
        'total': total,
        'status': 'Unpaid',
        'paidAmount': 0,
        'balance': total,
        'payments': [],
        'notes': data['notes'],
        'voided': False,
        'createdBy': actor.id,
        'createdAt': now,
        'updatedAt': now,
    }
    record = _new_record(db, 'purchase', payload, actor)
    for line in lines:
        _apply_stock(
            db, actor, line['itemId'], line['quantity'], data['date'], 'Purchase',
            f'Purchase {reference} — {supplier.payload["name"]}', reference,
        )
    _audit(db, request, actor, CREATE_ACTIONS['purchase'], 'Purchase', record.id, f'{reference} confirmed for {total}')
    return record


def _create_sale(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(SaleCreate, body).model_dump()
    now = _now()

    # Resolve existing products by id or name; create new ones server-side.
    # Only the catalogue fields are accepted — prices come from the request,
    # cost defaults to zero for a brand-new product.
    lines: list[dict[str, Any]] = []
    for entry in data['items']:
        product: BusinessRecord | None = None
        if entry.get('productId'):
            product = _get(db, 'product', entry['productId'])
        if product is None:
            name = entry['productName'].strip()
            if not name:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail='A product name is required for a new sale line.',
                )
            product = next(
                (
                    candidate for candidate in db.query(BusinessRecord).filter(BusinessRecord.kind == 'product').all()
                    if str(candidate.payload.get('name', '')).strip().lower() == name.lower()
                ),
                None,
            )
        if product is None:
            product_count = db.query(BusinessRecord).filter(BusinessRecord.kind == 'product').count() + 1
            product = _new_record(db, 'product', {
                'sku': f'PRD-{product_count:03d}',
                'name': name,
                'category': 'Other',
                'description': 'Added directly from a sales record',
                'cost': 0,
                'price': float(entry['unitPrice']),
                'trackedItemId': None,
                'archived': False,
                'createdAt': now,
            }, actor)
            _audit(db, request, actor, 'PRODUCT_CREATED', 'Product', product.id, f'{name} added to catalogue from a sale')

        lines.append({
            'productId': product.id,
            'productName': product.payload['name'],
            'name': product.payload['name'],
            'quantity': float(entry['quantity']),
            'unitPrice': float(entry['unitPrice']),
            'unitCost': float(product.payload.get('cost') or 0),
            'subtotal': round(float(entry['quantity']) * float(entry['unitPrice']), 2),
        })

    # The session uses autoflush=False, so newly created products are not
    # visible to the lookups below until they are flushed to the transaction.
    db.flush()

    # Validate all stock levels before applying any movement.
    for line in lines:
        product = _get(db, 'product', line['productId'])
        tracked_id = product.payload.get('trackedItemId')
        if tracked_id:
            item = _get(db, 'inventory', tracked_id)
            if float(item.payload['quantity']) < line['quantity']:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f'Not enough {item.payload["name"]} stock. Available: {item.payload["quantity"]}.',
                )

    subtotal = round(sum(line['subtotal'] for line in lines), 2)
    discount = float(data['discount'] or 0)
    if subtotal - discount < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Discount cannot exceed the sale total.')
    total = round(subtotal - discount, 2)
    cost = round(sum(line['quantity'] * line['unitCost'] for line in lines), 2)

    reference = _reference(db, 'sale', 'SAL')
    payload = {
        'reference': reference,
        'date': data['date'],
        'items': lines,
        'subtotal': subtotal,
        'discount': discount,
        'total': total,
        'cost': cost,
        'paymentMethod': data['paymentMethod'],
        'notes': data['notes'],
        'voided': False,
        'createdBy': actor.id,
        'createdAt': now,
        'updatedAt': now,
    }
    record = _new_record(db, 'sale', payload, actor)
    for line in lines:
        product = _get(db, 'product', line['productId'])
        tracked_id = product.payload.get('trackedItemId')
        if tracked_id:
            _apply_stock(
                db, actor, tracked_id, -line['quantity'], data['date'], 'Sale',
                f'Sale {reference} — {product.payload["name"]}', reference,
            )
    _audit(db, request, actor, CREATE_ACTIONS['sale'], 'Sale', record.id, f'{reference} recorded for {total}')
    return record


def _create_expense(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(ExpenseCreate, body).model_dump()
    reference = _reference(db, 'expense', 'EXP')
    record = _new_record(db, 'expense', {
        **data,
        'reference': reference,
        'recordedBy': actor.id,
        'createdAt': _now(),
        'reversed': False,
    }, actor)
    _audit(db, request, actor, CREATE_ACTIONS['expense'], 'Expense', record.id, f'{data["description"]} — {data["amount"]}')
    return record


def _create_production(db: Session, request: Request, actor: User, body: dict[str, Any]) -> BusinessRecord:
    data = _validate(ProductionCreate, body).model_dump()
    record = _new_record(db, 'production', {
        **data,
        'recordedBy': actor.id,
        'createdAt': _now(),
        'reversed': False,
    }, actor)
    _audit(db, request, actor, CREATE_ACTIONS['production'], 'Production', record.id, f'{data["quantity"]} × {data["productName"]} recorded')
    return record


CREATE_HANDLERS = {
    'inventory': _create_inventory,
    'supplier': _create_supplier,
    'product': _create_product,
    'purchase': _create_purchase,
    'sale': _create_sale,
    'expense': _create_expense,
    'production': _create_production,
}


def create_record(db: Session, request: Request, actor: User, kind: str, body: dict[str, Any]) -> dict[str, Any]:
    spec = KIND_SPECS.get(kind)
    handler = CREATE_HANDLERS.get(kind)
    if not spec or not handler:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Records of this type cannot be created here.')
    ensure_permission(actor, spec['manage'])
    record = handler(db, request, actor, body)
    db.commit()
    db.refresh(record)
    return record.payload


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def update_record(
    db: Session,
    request: Request,
    actor: User,
    kind: str,
    record_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    spec = KIND_SPECS.get(kind)
    schema = UPDATE_SCHEMAS.get(kind)
    if not spec or not schema:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Records of this type cannot be updated.')
    ensure_permission(actor, spec['manage'])
    record = _get(db, kind, record_id)
    ensure_owner(record, actor)

    data = _validate(schema, body).model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='No fields to update.')
    old_values = {key: record.payload.get(key) for key in data}
    record.payload = {**record.payload, **data, 'updatedAt': _now()}
    _audit(
        db, request, actor, f'{kind.upper()}_UPDATED', spec['entity'], record.id,
        f'{spec["entity"]} record updated', old_values=old_values, new_values=data,
    )
    db.commit()
    return record.payload


# ---------------------------------------------------------------------------
# Reverse (never delete)
# ---------------------------------------------------------------------------

def reverse_record(
    db: Session,
    request: Request,
    actor: User,
    kind: str,
    record_id: str,
    reason: str,
) -> dict[str, Any]:
    spec = KIND_SPECS.get(kind)
    action = REVERSE_ACTIONS.get(kind)
    if not spec or not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Records of this type cannot be reversed.')
    ensure_permission(actor, spec['manage'])
    record = _get(db, kind, record_id)
    ensure_owner(record, actor)

    if record.payload.get('voided') or record.payload.get('reversed'):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='This record has already been reversed.')

    now = _now()
    if kind == 'purchase':
        record.payload = {**record.payload, 'voided': True, 'status': 'Voided', 'updatedAt': now}
        for line in record.payload['items']:
            _apply_stock(
                db, actor, line['itemId'], -line['quantity'], now, 'Adjustment',
                f'Reversal of voided purchase {record.payload["reference"]}',
                f'VOID-{record.payload["reference"]}',
            )
    elif kind == 'sale':
        record.payload = {**record.payload, 'voided': True, 'updatedAt': now}
        for line in record.payload['items']:
            product = _get(db, 'product', line['productId'])
            tracked_id = product.payload.get('trackedItemId')
            if tracked_id:
                _apply_stock(
                    db, actor, tracked_id, line['quantity'], now, 'Adjustment',
                    f'Reversal of voided sale {record.payload["reference"]}',
                    f'VOID-{record.payload["reference"]}',
                )
    else:  # expense and production are preserved, not stock-linked
        record.payload = {
            **record.payload,
            'reversed': True,
            'reversalReason': reason,
            'reversedAt': now,
            'reversedBy': actor.id,
            'updatedAt': now,
        }

    _audit(
        db, request, actor, action, spec['entity'], record.id,
        f'{record.payload.get("reference") or spec["entity"]} reversed: {reason}',
    )
    db.commit()
    return record.payload


# ---------------------------------------------------------------------------
# Specialised actions
# ---------------------------------------------------------------------------

def record_movement(
    db: Session,
    request: Request,
    actor: User,
    item_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    ensure_permission(actor, 'inventory.manage')
    item = _get(db, 'inventory', item_id)
    data = _validate(MovementCreate, body).model_dump()
    quantity = float(data['quantity'])
    movement_type = data['type']

    if movement_type == 'Adjustment':
        delta = round(quantity - float(item.payload['quantity']), 2)
    elif movement_type == 'Purchase':
        delta = quantity
    else:  # Sale, Wastage, Opening Stock, Other remove stock
        delta = -quantity

    reference = data['reference'].strip() or _reference(db, 'movement', 'REF', 6)
    reason = data['reason'].strip() or f'{movement_type} recorded from inventory'
    movement = _apply_stock(db, actor, item_id, delta, _now(), movement_type, reason, reference)
    _audit(
        db, request, actor, 'STOCK_MOVEMENT', 'Inventory', item.id,
        f'{movement_type} of {item.payload["name"]} ({delta:+.2f} {item.payload["unit"]})',
    )
    db.commit()
    db.refresh(item)
    return {'item': item.payload, 'movement': movement.payload}


def record_payment(
    db: Session,
    request: Request,
    actor: User,
    purchase_id: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    ensure_permission(actor, 'purchases.manage')
    record = _get(db, 'purchase', purchase_id)
    ensure_owner(record, actor)
    if record.payload.get('voided'):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='A voided purchase cannot receive payments.')

    data = _validate(PaymentCreate, body).model_dump()
    amount = float(data['amount'])
    if amount > float(record.payload['balance']):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Payment cannot exceed the outstanding balance.')

    paid = round(float(record.payload['paidAmount']) + amount, 2)
    balance = round(float(record.payload['total']) - paid, 2)
    status_value = 'Paid' if balance <= 0 else 'Partially paid' if paid > 0 else 'Unpaid'
    payment = {
        'id': new_id('pay-'),
        'amount': amount,
        'date': data['date'] or _now(),
        'method': data['method'],
    }
    record.payload = {
        **record.payload,
        'paidAmount': paid,
        'balance': balance,
        'status': status_value,
        'payments': [*record.payload['payments'], payment],
        'updatedAt': _now(),
    }
    _audit(
        db, request, actor, 'SUPPLIER_PAYMENT', 'Purchase', record.id,
        f'{amount} paid toward {record.payload["reference"]}',
    )
    db.commit()
    return record.payload
