"""Business-record API.

All business data is read and changed through this router. There are no DELETE
endpoints: cancelled records are reversed so financial and stock history is
preserved. Permissions and object ownership are enforced in the service layer.
"""

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import business
from ..audit import record_audit
from ..auth import get_current_user, require_csrf, require_permissions
from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import PaymentCreate, ReverseRequest
from backend.scripts.seed_business import reset_business_records

router = APIRouter(prefix='/business', tags=['business'])


@router.get('/snapshot')
def business_snapshot(
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, list[dict[str, Any]]]:
    """All collections the current role is allowed to see, in one call."""
    return business.snapshot(db, actor)


@router.post('/demo/reset', dependencies=[Depends(require_csrf)])
def reset_demo_business_data(
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permissions('users.manage')),
) -> dict[str, list[dict[str, Any]]]:
    """Replace demo business records with the seeded dataset (owner, demo only).

    This endpoint does not exist in a production deployment, so the public demo
    credentials can never be used to wipe real business data.
    """
    demo_allowed = not settings.is_production or os.environ.get('JSBH_ALLOW_DEMO_SEED', '').lower() == 'true'
    if not demo_allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found.')

    counts = reset_business_records(db, actor, request)
    record_audit(
        db, request,
        event_type='business',
        action='DEMO_DATA_RESTORED',
        entity='Configuration',
        user_id=actor.id,
        details='Demo business records restored from seed: ' + ', '.join(
            f'{key}={value}' for key, value in counts.items() if value
        ),
    )
    return business.snapshot(db, actor)


@router.get('/{kind}')
def list_business_records(
    kind: str,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return business.list_records(db, kind, actor)


@router.post('/{kind}', status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_business_record(
    kind: str,
    body: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    return business.create_record(db, request, actor, kind, body)


@router.patch('/{kind}/{record_id}', dependencies=[Depends(require_csrf)])
def update_business_record(
    kind: str,
    record_id: str,
    body: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    return business.update_record(db, request, actor, kind, record_id, body)


@router.post('/{kind}/{record_id}/reverse', dependencies=[Depends(require_csrf)])
def reverse_business_record(
    kind: str,
    record_id: str,
    payload: ReverseRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    return business.reverse_record(db, request, actor, kind, record_id, payload.reason)


@router.post('/inventory/{item_id}/movement', dependencies=[Depends(require_csrf)])
def record_stock_movement(
    item_id: str,
    body: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    return business.record_movement(db, request, actor, item_id, body)


@router.post('/purchase/{purchase_id}/payment', dependencies=[Depends(require_csrf)])
def record_supplier_payment(
    purchase_id: str,
    payload: PaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict[str, Any]:
    return business.record_payment(db, request, actor, purchase_id, payload.model_dump())
