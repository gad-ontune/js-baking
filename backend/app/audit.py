"""Audit logging with an append-only SHA-256 hash chain."""

import hashlib
import json

from fastapi import Request
from sqlalchemy.orm import Session

from .security import new_id, utc_now
from .models import AuditLog

GENESIS_HASH = '0' * 64
_CHAIN_FIELDS = (
    'id', 'event_type', 'action', 'entity', 'entity_id', 'user_id', 'outcome',
    'details', 'old_values', 'new_values', 'ip_address', 'user_agent',
    'request_id', 'created_at',
)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()[:64]
    return request.client.host if request.client else None


def _canonical(entry: AuditLog) -> dict:
    values = {}
    for field in _CHAIN_FIELDS:
        value = getattr(entry, field, None)
        if hasattr(value, 'isoformat'):
            value = value.isoformat()
        values[field] = value
    return values


def _compute_hash(previous_hash: str, entry: AuditLog) -> str:
    payload = previous_hash + json.dumps(_canonical(entry), sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


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
    last = (
        db.query(AuditLog)
        .filter(AuditLog.sequence_number.is_not(None))
        .order_by(AuditLog.sequence_number.desc())
        .first()
    )
    previous_hash = last.entry_hash if last else GENESIS_HASH
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
        created_at=utc_now(),
        sequence_number=(last.sequence_number or 0) + 1 if last else 1,
        previous_hash=previous_hash,
    )
    entry.entry_hash = _compute_hash(previous_hash, entry)
    db.add(entry)
    if commit:
        db.commit()
    return entry


def verify_chain(db: Session) -> dict:
    """Recompute every hash and report the first mismatch, if any."""
    entries = (
        db.query(AuditLog)
        .filter(AuditLog.sequence_number.is_not(None))
        .order_by(AuditLog.sequence_number.asc())
        .all()
    )
    expected_previous = GENESIS_HASH
    for entry in entries:
        if entry.previous_hash != expected_previous or entry.entry_hash != _compute_hash(expected_previous, entry):
            return {
                'valid': False,
                'checked': entries.index(entry),
                'first_invalid_sequence': entry.sequence_number,
            }
        expected_previous = entry.entry_hash
    return {
        'valid': True,
        'checked': len(entries),
        'first_invalid_sequence': None,
    }
