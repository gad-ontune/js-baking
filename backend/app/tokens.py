"""Single-use security token issue and consumption helpers."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .models import SecurityToken, User
from .security import hash_security_token, new_id, new_security_token, utc_now

TOKEN_LIFETIMES = {
    'password_reset': settings.reset_token_minutes,
    'email_verification': settings.email_verification_token_minutes,
    'mfa_challenge': settings.mfa_challenge_minutes,
}


def issue_token(
    db: Session,
    user: User,
    kind: str,
    *,
    issued_by: str | None = None,
    minutes: int | None = None,
) -> tuple[str, SecurityToken]:
    """Create a token, returning the plaintext once and persisting only its hash."""
    if kind not in TOKEN_LIFETIMES:
        raise ValueError(f'Unsupported token kind: {kind}')
    plaintext = new_security_token()
    token = SecurityToken(
        id=new_id('tok_'),
        token_hash=hash_security_token(plaintext),
        user_id=user.id,
        kind=kind,
        expires_at=utc_now() + timedelta(minutes=minutes or TOKEN_LIFETIMES[kind]),
        issued_by=issued_by,
    )
    db.add(token)
    db.commit()
    return plaintext, token


_INVALID_TOKEN = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail='This code is invalid or has expired. Request a new one.',
)


def validate_token(db: Session, plaintext: str, kind: str) -> SecurityToken:
    """Check a token without consuming it (used for retryable MFA challenges)."""
    if not plaintext or len(plaintext) > 256:
        raise _INVALID_TOKEN
    token = db.query(SecurityToken).filter(
        SecurityToken.token_hash == hash_security_token(plaintext),
        SecurityToken.kind == kind,
        SecurityToken.used_at.is_(None),
    ).first()
    if not token or token.expires_at <= utc_now():
        raise _INVALID_TOKEN
    return token


def consume_token(db: Session, plaintext: str, kind: str) -> SecurityToken:
    """Validate and atomically consume a token. Generic errors avoid oracles."""
    token = validate_token(db, plaintext, kind)
    # Conditional update prevents two simultaneous requests from both using it.
    updated = db.query(SecurityToken).filter(
        SecurityToken.id == token.id,
        SecurityToken.used_at.is_(None),
    ).update({SecurityToken.used_at: utc_now()}, synchronize_session=False)
    db.commit()
    if not updated:
        raise _INVALID_TOKEN
    db.refresh(token)
    return token
