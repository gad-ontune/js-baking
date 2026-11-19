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
from ..models import Session as SessionModel
from ..models import User
from ..ratelimit import rate_limiter
from ..schemas import (
    EmailVerificationRequest, ForgotPasswordRequest, ForgotPasswordResponse,
    LoginRequest, LoginResponse, PasswordChangeRequest, ResetPasswordRequest,
    ResetPasswordResponse, UserResponse, VerificationResponse,
)
from ..security import hash_password, needs_rehash, utc_now, verify_password
from ..tokens import consume_token, issue_token

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
        rate_limiter.record(user_key)
        rate_limiter.record(ip_key)
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

    rate_limiter.record(limit_key)
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
    rate_limiter.record(limit_key)
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
    rate_limiter.record(limit_key)
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
