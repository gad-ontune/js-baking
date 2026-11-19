import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..auth import (
    client_ip, create_session, get_current_user, require_csrf,
    require_safe_origin, revoke_current_session,
)
from ..config import settings
from ..database import get_db
from ..email_service import email_configured, send_email_verification, send_password_reset
from .. import mfa as mfa_service
from ..models import RecoveryCode
from ..models import Session as SessionModel
from ..models import User
from ..ratelimit import rate_limiter
from ..schemas import (
    EmailVerificationRequest, ForgotPasswordRequest, ForgotPasswordResponse,
    LoginRequest, LoginResponse, MfaChallengeRequest, MfaCodeRequest,
    MfaDisableRequest, MfaSetupResponse, PasswordChangeRequest, ResetPasswordRequest,
    ResetPasswordResponse, UserResponse, VerificationResponse,
)
from ..security import (
    hash_password, hash_security_token, needs_rehash, new_id, utc_now, verify_password,
)
from ..tokens import consume_token, issue_token, validate_token

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/login', response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    user_key = f'login:user:{payload.username}'
    ip_key = f'login:ip:{client_ip(request) or "unknown"}'
    window = settings.login_attempt_window_minutes * 60
    rate_limiter.check(user_key, settings.login_attempt_limit, window)
    rate_limiter.check(ip_key, settings.ip_request_limit, window)

    user = db.query(User).filter(User.username == payload.username).first()
    valid = bool(user and user.active and verify_password(user.password_hash, payload.password))

    if not valid:
        rate_limiter.record(user_key, window)
        rate_limiter.record(ip_key, window)
        record_audit(
            db,
            request,
            event_type='AUTH',
            action='LOGIN_FAILED',
            entity='Authentication',
            outcome='failure',
            details='Failed sign-in attempt',
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect username or password.')

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)

    if user.mfa_enabled:
        # Password is correct, but no session is created until the second factor
        # is verified. The short-lived challenge carries no privileges.
        challenge, _ = issue_token(db, user, 'mfa_challenge')
        record_audit(
            db, request, event_type='AUTH', action='MFA_CHALLENGE_ISSUED',
            entity='User', entity_id=user.id, user_id=user.id,
        )
        return LoginResponse(
            user=UserResponse.model_validate(user),
            mfa_required=True,
            mfa_challenge_token=challenge,
        )

    csrf_token, expires_at = create_session(db, request, response, user)
    rate_limiter.clear(user_key)
    record_audit(db, request, event_type='AUTH', action='LOGIN_SUCCESS', entity='User', entity_id=user.id, user_id=user.id)

    return LoginResponse(
        user=UserResponse.model_validate(user),
        csrf_token=csrf_token,
        session_expires_at=expires_at,
    )


@router.post('/logout', dependencies=[Depends(require_csrf)], status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(get_db)) -> None:
    revoke_current_session(request, db)


@router.post('/change-password', response_model=LoginResponse, dependencies=[Depends(require_csrf)])
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoginResponse:
    if not verify_password(user.password_hash, payload.current_password):
        record_audit(
            db,
            request,
            event_type='AUTH',
            action='PASSWORD_CHANGE_FAILED',
            entity='User',
            entity_id=user.id,
            user_id=user.id,
            outcome='failure',
            details='Current password verification failed',
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Current password is incorrect.')

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    # Rotating the session invalidates every previously issued credential.
    csrf_token, expires_at = create_session(db, request, response, user)
    record_audit(
        db,
        request,
        event_type='AUTH',
        action='PASSWORD_CHANGED',
        entity='User',
        entity_id=user.id,
        user_id=user.id,
    )
    return LoginResponse(
        user=UserResponse.model_validate(user),
        csrf_token=csrf_token,
        session_expires_at=expires_at,
    )


@router.get('/me', response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)


def _show_dev_token() -> bool:
    """Development convenience only; production never exposes recovery codes."""
    return not settings.is_production or os.environ.get('JSBH_SHOW_DEV_TOKENS', '').lower() == 'true'


def _revoke_all_sessions(db: Session, user_id: str) -> None:
    db.query(SessionModel).filter(
        SessionModel.user_id == user_id,
        SessionModel.revoked_at.is_(None),
    ).update({SessionModel.revoked_at: utc_now()}, synchronize_session=False)


@router.post(
    '/forgot-password',
    response_model=ForgotPasswordResponse,
    dependencies=[Depends(require_safe_origin)],
)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ForgotPasswordResponse:
    """Owner-only recovery. Identity is verified by username AND email address.

    Responses are deliberately uniform: callers cannot tell whether an account
    matched. In production, SMTP must be configured or the request fails closed
    instead of silently dropping the code.
    """
    limit_key = f'forgot:ip:{client_ip(request) or "unknown"}'
    window = settings.login_attempt_window_minutes * 60
    rate_limiter.check(limit_key, 5, window)

    if settings.is_production and not email_configured():
        record_audit(
            db, request, event_type='AUTH', action='PASSWORD_RESET_UNAVAILABLE',
            entity='Authentication', outcome='failure',
            details='Recovery requested but SMTP is not configured',
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Email recovery is not configured for this deployment.',
        )

    user = db.query(User).filter(
        User.role == 'owner',
        User.active.is_(True),
        User.username == payload.username,
        User.email.is_not(None),
        User.email.ilike(payload.email),
    ).first()

    dev_token = None
    if user:
        token, _ = issue_token(db, user, 'password_reset')
        send_password_reset(user.email, token, owner_initiated=False)
        if _show_dev_token():
            dev_token = token
        record_audit(
            db, request, event_type='AUTH', action='PASSWORD_RESET_REQUESTED',
            entity='User', entity_id=user.id, user_id=user.id,
            details='Owner password recovery code issued',
        )
    else:
        record_audit(
            db, request, event_type='AUTH', action='PASSWORD_RESET_REQUESTED',
            entity='Authentication', outcome='failure',
            details='No matching active owner account',
        )

    rate_limiter.record(limit_key, window)
    return ForgotPasswordResponse(
        message='If an active owner account matches those details, a reset code has been issued.',
        email_sent=email_configured(),
        dev_token=dev_token,
    )


@router.post(
    '/reset-password',
    response_model=ResetPasswordResponse,
    dependencies=[Depends(require_safe_origin)],
)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ResetPasswordResponse:
    """Complete recovery with a single-use token and a policy-compliant password."""
    limit_key = f'reset:ip:{client_ip(request) or "unknown"}'
    rate_limiter.check(limit_key, 10, settings.login_attempt_window_minutes * 60)

    token = consume_token(db, payload.token, 'password_reset')
    user = db.query(User).filter(User.id == token.user_id, User.active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='This code is invalid or has expired. Request a new one.')

    user.password_hash = hash_password(payload.new_password)
    _revoke_all_sessions(db, user.id)
    db.commit()
    rate_limiter.record(limit_key, settings.login_attempt_window_minutes * 60)
    record_audit(
        db, request, event_type='AUTH', action='PASSWORD_RESET_COMPLETED',
        entity='User', entity_id=user.id, user_id=user.id,
        details='Password set using a single-use recovery code; sessions revoked',
    )
    return ResetPasswordResponse(message='Password updated. Sign in with your new password.')


@router.post(
    '/email/verification-code',
    response_model=VerificationResponse,
    dependencies=[Depends(require_csrf)],
)
def request_email_verification(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VerificationResponse:
    if not user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='This account has no email address to verify.')
    limit_key = f'verify:user:{user.id}'
    rate_limiter.check(limit_key, 5, settings.login_attempt_window_minutes * 60)

    token, _ = issue_token(db, user, 'email_verification')
    delivered = send_email_verification(user.email, token)
    rate_limiter.record(limit_key, settings.login_attempt_window_minutes * 60)
    record_audit(
        db, request, event_type='AUTH', action='EMAIL_VERIFICATION_SENT',
        entity='User', entity_id=user.id, user_id=user.id,
        details='Verification code issued to the account email',
    )
    return VerificationResponse(
        message='If the account has a verified email address, a verification code has been issued.',
        email_sent=delivered,
        dev_token=token if _show_dev_token() and not delivered else None,
    )


@router.post('/email/verify', dependencies=[Depends(require_csrf)])
def verify_email(
    payload: EmailVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    token = consume_token(db, payload.token, 'email_verification')
    if token.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='This code is invalid or has expired. Request a new one.')

    user.email_verified_at = utc_now()
    db.commit()
    record_audit(
        db, request, event_type='AUTH', action='EMAIL_VERIFIED',
        entity='User', entity_id=user.id, user_id=user.id,
        details='Email address verified with a single-use code',
    )
    return {'message': 'Email address verified.'}


# ---------------------------------------------------------------------------
# Multi-factor authentication (TOTP + single-use recovery codes)
# ---------------------------------------------------------------------------

def _use_recovery_code(db: Session, user: User, code: str) -> bool:
    normalized = mfa_service.normalize_recovery_code(code)
    if len(normalized) != mfa_service.RECOVERY_CODE_LENGTH:
        return False
    record = db.query(RecoveryCode).filter(
        RecoveryCode.user_id == user.id,
        RecoveryCode.code_hash == hash_security_token(normalized),
        RecoveryCode.used_at.is_(None),
    ).first()
    if not record:
        return False
    updated = db.query(RecoveryCode).filter(
        RecoveryCode.id == record.id, RecoveryCode.used_at.is_(None),
    ).update({RecoveryCode.used_at: utc_now()}, synchronize_session=False)
    db.commit()
    return bool(updated)


def _verify_second_factor(db: Session, user: User, code: str, request: Request) -> bool:
    if user.mfa_secret_enc and mfa_service.verify_code(mfa_service.decrypt_secret(user.mfa_secret_enc), code):
        return True
    if _use_recovery_code(db, user, code):
        record_audit(
            db, request, event_type='AUTH', action='MFA_RECOVERY_CODE_USED',
            entity='User', entity_id=user.id, user_id=user.id,
            details='A single-use MFA recovery code was accepted',
        )
        return True
    return False


@router.post('/mfa/setup', response_model=MfaSetupResponse, dependencies=[Depends(require_csrf)])
def setup_mfa(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MfaSetupResponse:
    mfa_service.require_mfa_key()
    if user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='MFA is already enabled.')

    secret = mfa_service.generate_secret()
    recovery_codes = mfa_service.generate_recovery_codes()
    user.mfa_secret_enc = mfa_service.encrypt_secret(secret)
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete(synchronize_session=False)
    db.add_all([
        RecoveryCode(
            id=new_id('rec_'), user_id=user.id,
            code_hash=hash_security_token(mfa_service.normalize_recovery_code(code)),
        )
        for code in recovery_codes
    ])
    db.commit()
    record_audit(
        db, request, event_type='AUTH', action='MFA_SETUP_STARTED',
        entity='User', entity_id=user.id, user_id=user.id,
        details='Authenticator secret and recovery codes generated; values omitted',
    )
    return MfaSetupResponse(
        secret=secret,
        provisioning_uri=mfa_service.provisioning_uri(user.username, secret),
        recovery_codes=recovery_codes,
    )


@router.post('/mfa/enable', dependencies=[Depends(require_csrf)])
def enable_mfa(
    payload: MfaCodeRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    mfa_service.require_mfa_key()
    if not user.mfa_secret_enc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Start MFA setup first.')
    if not mfa_service.verify_code(mfa_service.decrypt_secret(user.mfa_secret_enc), payload.code):
        record_audit(
            db, request, event_type='AUTH', action='MFA_ENABLE_FAILED',
            entity='User', entity_id=user.id, user_id=user.id, outcome='failure',
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='That authenticator code is incorrect.')
    user.mfa_enabled = True
    db.commit()
    record_audit(
        db, request, event_type='AUTH', action='MFA_ENABLED',
        entity='User', entity_id=user.id, user_id=user.id,
    )
    return {'message': 'Multi-factor authentication is enabled.'}


@router.post('/mfa/disable', dependencies=[Depends(require_csrf)])
def disable_mfa(
    payload: MfaDisableRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Password is incorrect.')
    if not user.mfa_enabled or not _verify_second_factor(db, user, payload.code, request):
        record_audit(
            db, request, event_type='AUTH', action='MFA_DISABLE_FAILED',
            entity='User', entity_id=user.id, user_id=user.id, outcome='failure',
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='That second-factor code is incorrect.')

    user.mfa_enabled = False
    user.mfa_secret_enc = None
    db.query(RecoveryCode).filter(RecoveryCode.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    record_audit(
        db, request, event_type='AUTH', action='MFA_DISABLED',
        entity='User', entity_id=user.id, user_id=user.id,
    )
    return {'message': 'Multi-factor authentication is disabled.'}


@router.post(
    '/mfa/complete',
    response_model=LoginResponse,
    dependencies=[Depends(require_safe_origin)],
)
def complete_mfa(
    payload: MfaChallengeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LoginResponse:
    limit_key = f'mfa:ip:{client_ip(request) or "unknown"}'
    rate_limiter.check(limit_key, 5, settings.login_attempt_window_minutes * 60)

    challenge = validate_token(db, payload.challenge_token, 'mfa_challenge')
    user = db.query(User).filter(User.id == challenge.user_id, User.active.is_(True)).first()
    if not user or not user.mfa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='This challenge is invalid. Sign in again.')

    if not _verify_second_factor(db, user, payload.code, request):
        rate_limiter.record(limit_key, settings.login_attempt_window_minutes * 60)
        record_audit(
            db, request, event_type='AUTH', action='MFA_VERIFY_FAILED',
            entity='User', entity_id=user.id, user_id=user.id, outcome='failure',
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect second-factor code.')

    consume_token(db, payload.challenge_token, 'mfa_challenge')
    csrf_token, expires_at = create_session(db, request, response, user)
    rate_limiter.clear(f'login:user:{user.username}')
    record_audit(
        db, request, event_type='AUTH', action='LOGIN_SUCCESS',
        entity='User', entity_id=user.id, user_id=user.id,
        details='Password and second factor verified',
    )
    return LoginResponse(
        user=UserResponse.model_validate(user),
        csrf_token=csrf_token,
        session_expires_at=expires_at,
    )
