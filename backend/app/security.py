import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .config import settings

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 1024

_COMMON_PASSWORDS = {
    'password', 'password123', '123456789012', 'qwerty123456', 'letmein12345',
    'admin123456', 'welcome12345', 'iloveyou1234', 'owner12345', 'staff12345',
}

_hasher = PasswordHasher(
    time_cost=settings.argon2_time_cost,
    memory_cost=settings.argon2_memory_cost_kib,
    parallelism=settings.argon2_parallelism,
    hash_len=32,
    salt_len=16,
)


def new_id(prefix: str = '') -> str:
    return f'{prefix}{uuid.uuid4()}'


def utc_now() -> datetime:
    """Naive UTC value for database columns and expiry comparisons."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def password_policy_error(password: str) -> str | None:
    if not isinstance(password, str):
        return 'Invalid password.'
    if len(password) < MIN_PASSWORD_LENGTH:
        return f'Password must be at least {MIN_PASSWORD_LENGTH} characters.'
    if len(password) > MAX_PASSWORD_LENGTH:
        return 'Password is too long.'
    if password.strip() != password:
        return 'Password cannot start or end with whitespace.'
    if password.lower() in _COMMON_PASSWORDS:
        return 'Password is too common.'
    return None


def hash_password(password: str) -> str:
    error = password_policy_error(password)
    if error:
        raise ValueError(error)
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    if not isinstance(password, str) or len(password) > MAX_PASSWORD_LENGTH:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


# Recovery, verification and MFA challenge tokens use the same one-way digest.
hash_security_token = hash_session_token


def new_security_token() -> str:
    """High-entropy single-use token. Returned to the caller once, never stored."""
    return secrets.token_urlsafe(32)


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def tokens_equal(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    return hmac.compare_digest(left, right)
