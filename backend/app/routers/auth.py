from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..auth import client_ip, create_session, get_current_user, revoke_current_session, require_csrf
from ..config import settings
from ..database import get_db
from ..models import User
from ..ratelimit import rate_limiter
from ..schemas import LoginRequest, LoginResponse, PasswordChangeRequest, UserResponse
from ..security import hash_password, needs_rehash, verify_password

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
