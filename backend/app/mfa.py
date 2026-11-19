"""TOTP multi-factor authentication helpers.

Authenticator secrets are encrypted at rest with Fernet. Recovery codes are
stored only as SHA-256 digests and are displayed once when generated.
"""

import base64
import hashlib
import secrets

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from .config import settings

_RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_RECOVERY_COUNT = 10
RECOVERY_CODE_LENGTH = 12


def mfa_available() -> bool:
    return bool(settings.mfa_encryption_key) or not settings.is_production


def _fernet() -> Fernet:
    if settings.mfa_encryption_key:
        try:
            key = base64.urlsafe_b64decode(settings.mfa_encryption_key.encode())
            if len(key) != 32:
                raise ValueError
        except (ValueError, TypeError):
            raise RuntimeError('MFA_ENCRYPTION_KEY must be a base64-urlsafe 32-byte key.') from None
    else:
        # Deterministic development-only key; production requires an explicit key.
        key = hashlib.sha256(('jsbh-dev-mfa:' + settings.app_name).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret: str) -> str:
    if not mfa_available():
        raise RuntimeError('MFA is not configured for this deployment.')
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise RuntimeError('Stored MFA secret could not be decrypted.') from exc


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(username: str, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name='JS Baking House')


def verify_code(secret: str, code: str) -> bool:
    if not code or len(code) > 16:
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except (ValueError, TypeError):
        return False


def normalize_recovery_code(code: str) -> str:
    return ''.join(character for character in code.upper() if character.isalnum())


def generate_recovery_codes() -> list[str]:
    return [
        '-'.join(''.join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(4)) for _ in range(3))
        for _ in range(_RECOVERY_COUNT)
    ]


def require_mfa_key() -> None:
    if not mfa_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='MFA is not configured for this deployment.',
        )
