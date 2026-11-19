from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..audit import verify_chain
from ..auth import require_permissions
from ..database import get_db
from ..models import AuditLog
from ..schemas import AuditResponse

router = APIRouter(prefix='/audit', tags=['audit'])


@router.get('', response_model=list[AuditResponse])
def list_audit(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    actor=Depends(require_permissions('audit.view')),
) -> list[AuditLog]:
    """Read-only audit view. No endpoint can update or delete audit records."""
    return (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get('/verify')
def verify_audit_integrity(
    db: Session = Depends(get_db),
    actor=Depends(require_permissions('audit.view')),
) -> dict:
    """Recompute the audit hash chain. No mutation endpoint exists."""
    return verify_chain(db)
