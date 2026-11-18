from fastapi import Request
from sqlalchemy.orm import Session

from .security import new_id
from .models import AuditLog


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()[:64]
    return request.client.host if request.client else None


def record_audit(
    db: Session,
    request: Request,
    *,
    event_type: str,
    action: str,
    entity: str,
    entity_id: str | None = None,
    user_id: str | None = None,
    outcome: str = 'success',
    details: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        id=new_id('audit_'),
        event_type=event_type,
        action=action,
        entity=entity,
        entity_id=entity_id,
        user_id=user_id,
        outcome=outcome,
        details=details,
        old_values=old_values,
        new_values=new_values,
        ip_address=_client_ip(request),
        user_agent=request.headers.get('user-agent', '')[:1000] or None,
        request_id=request.headers.get('x-request-id', '')[:64] or None,
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry
