"""Security anomaly alerts derived from committed audit events.

Alerts are deliberately narrow: repeated failed sign-ins, privileged account
changes, recovery-code issuance and audit-chain failures. They never include
passwords, tokens, MFA secrets or full request bodies. Delivery is best-effort
and deduplicated; Redis is used for cross-worker deduplication when configured,
with a per-process fallback for local development.
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from datetime import timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .email_service import send_security_alert
from .models import AuditLog
from .security import utc_now

logger = logging.getLogger('jsbh.alerts')

_memory_claims: dict[str, float] = {}
_memory_lock = threading.Lock()

_PRIVILEGED_ACTIONS = {
    'USER_ROLE_CHANGED': ('privileged.role_change', 'User role changed'),
    'USER_DEACTIVATED': ('privileged.status_change', 'User deactivated'),
    'USER_ACTIVATED': ('privileged.status_change', 'User activated'),
    'RESET_TOKEN_ISSUED': ('privileged.reset_issued', 'Password recovery code issued'),
    'SESSIONS_REVOKED': ('privileged.sessions_revoked', 'User sessions revoked'),
    'MFA_DISABLED': ('privileged.mfa_disabled', 'MFA disabled'),
    'PASSWORD_RESET_COMPLETED': ('privileged.reset_completed', 'Owner password recovered'),
}


def alerting_configured() -> bool:
    return bool(settings.alert_email_to or settings.alert_webhook_url)


def _claim(key: str, cooldown_seconds: int) -> bool:
    """Return True once per key per cooldown window."""
    if settings.redis_url:
        try:
            import redis  # imported lazily; local installs need no Redis dependency

            client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
            if client.set(f'jsbh:alert:{key[:120]}', '1', nx=True, ex=max(1, cooldown_seconds)):
                return True
            return False
        except Exception as exc:  # redis errors vary by driver/version
            logger.warning('Alert deduplication store unavailable, using local state: %s', type(exc).__name__)

    import time

    now = time.monotonic()
    with _memory_lock:
        expires = _memory_claims.get(key, 0.0)
        if expires > now:
            return False
        _memory_claims[key] = now + cooldown_seconds
        return True


def _post_webhook(payload: dict[str, Any]) -> bool:
    if not settings.alert_webhook_url.lower().startswith('https://'):
        logger.warning('Refusing to send a security alert over an insecure scheme')
        return False
    data = json.dumps(payload, sort_keys=True).encode('utf-8')
    request = urllib.request.Request(
        settings.alert_webhook_url,
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(  # nosec B310 - scheme validated above; HTTPS enforced in production
            request, timeout=settings.smtp_timeout_seconds
        ) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, OSError, ValueError) as exc:
        logger.warning('Security alert webhook delivery failed: %s', type(exc).__name__)
        return False


def _clean(value: Any) -> str:
    return str(value)[:200] if value is not None else 'unknown'


def send_alert(kind: str, title: str, details: dict[str, Any]) -> bool:
    """Deliver one alert to every configured destination. Returns True if any succeeded."""
    if not alerting_configured():
        return False

    lines = [f'{name}: {_clean(value)}' for name, value in sorted(details.items())]
    payload = {'kind': kind, 'title': title, 'details': details}
    delivered = False

    if settings.alert_webhook_url:
        delivered = _post_webhook(payload) or delivered
    if settings.alert_email_to:
        delivered = send_security_alert(settings.alert_email_to, title, lines) or delivered

    if not delivered:
        logger.warning('Security alert %s could not be delivered to any destination', kind)
    return delivered


def alert_chain_failure(result: dict) -> bool:
    """Alert when the append-only audit hash chain fails verification."""
    if not alerting_configured() or result.get('valid'):
        return False
    sequence = result.get('first_invalid_sequence')
    if not _claim(f'chain_failure:{sequence}', settings.alert_cooldown_minutes * 60):
        return False
    return send_alert(
        'integrity.chain_failure',
        'Audit chain integrity failure',
        {
            'first_invalid_sequence': sequence,
            'entries_checked': result.get('checked'),
            'action_required': 'Preserve the database and investigate immediately.',
        },
    )


def evaluate_event(db: Session, entry: AuditLog) -> bool:
    """Inspect one newly committed audit entry and alert on anomalies."""
    if not alerting_configured():
        return False

    if entry.event_type == 'AUTH' and entry.action == 'LOGIN_FAILED':
        since = utc_now() - timedelta(minutes=settings.alert_window_minutes)
        count = db.query(func.count(AuditLog.id)).filter(
            AuditLog.event_type == 'AUTH',
            AuditLog.action == 'LOGIN_FAILED',
            AuditLog.created_at >= since,
        ).scalar() or 0
        if count < settings.alert_failed_login_threshold:
            return False
        if not _claim('login_burst', settings.alert_cooldown_minutes * 60):
            return False
        return send_alert(
            'auth.login_burst',
            'Repeated failed sign-ins',
            {
                'failed_attempts': count,
                'window_minutes': settings.alert_window_minutes,
                'source_ip': entry.ip_address,
                'latest_request_id': entry.request_id,
            },
        )

    privileged = _PRIVILEGED_ACTIONS.get(entry.action) if entry.event_type in {'USER', 'SESSION', 'AUTH'} else None
    if not privileged:
        return False
    kind, title = privileged
    if not _claim(f'{kind}:{entry.entity_id}:{entry.user_id}', settings.alert_cooldown_minutes * 60):
        return False
    return send_alert(
        kind,
        title,
        {
            'action': entry.action,
            'actor_user_id': entry.user_id,
            'target_entity': entry.entity,
            'target_id': entry.entity_id,
            'source_ip': entry.ip_address,
            'request_id': entry.request_id,
            'occurred_at': entry.created_at.isoformat() if entry.created_at else None,
        },
    )


def reset_alert_state() -> None:
    """Test helper: clear local deduplication state between cases."""
    with _memory_lock:
        _memory_claims.clear()
