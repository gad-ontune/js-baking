from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Session as SessionModel
from .models import User
from .security import hash_session_token, new_csrf_token, new_session_token, tokens_equal, utc_now

ROLE_PERMISSIONS: dict[str, set[str]] = {
    'owner': {'*'},
    'manager': {
        'dashboard.view', 'inventory.view', 'inventory.manage', 'purchases.view',
        'purchases.manage', 'suppliers.view', 'production.view', 'production.manage',
        'sales.view', 'sales.manage', 'expenses.view', 'expenses.manage', 'reports.basic',
    },
    'staff': {
        'dashboard.view', 'inventory.view', 'production.view', 'production.manage',
        'sales.view', 'sales.manage', 'expenses.view', 'expenses.manage', 'reports.basic',
    },
}

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail='Authentication required.',
    headers={'WWW-Authenticate': 'Cookie'},
)


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()[:64]
    return request.client.host if request.client else None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise UNAUTHORIZED

    session = (
        db.query(SessionModel)
        .filter(SessionModel.id == hash_session_token(token), SessionModel.revoked_at.is_(None))
        .first()
    )
    if not session:
        raise UNAUTHORIZED

    now = utc_now()
    idle_limit = timedelta(seconds=settings.session_idle_seconds)
    if session.expires_at <= now or now - session.last_seen_at > idle_limit:
        session.revoked_at = now
        db.commit()
        raise UNAUTHORIZED

    user = db.query(User).filter(User.id == session.user_id, User.active.is_(True)).first()
    if not user:
        raise UNAUTHORIZED

    session.last_seen_at = now
    db.commit()
    return user


def require_permissions(*permissions: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        allowed = ROLE_PERMISSIONS.get(user.role, set())
        if '*' not in allowed and not set(permissions).issubset(allowed):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Permission denied.')
        return user

    return dependency


def require_csrf(request: Request) -> None:
    if request.method in {'GET', 'HEAD', 'OPTIONS'}:
        return

    # Defence in depth: browsers send Origin on cross-site POSTs. A request
    # with an explicit but untrusted Origin is rejected even if a token leaks.
    origin = request.headers.get('origin')
    if origin and origin not in settings.cors_origin_list:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Untrusted request origin.')

    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get('x-csrf-token')
    if not tokens_equal(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='CSRF validation failed.')


def create_session(db: Session, request: Request, response: Response, user: User) -> tuple[str, datetime]:
    """Rotate sessions on authentication and return CSRF token and expiry."""
    now = utc_now()
    db.query(SessionModel).filter(
        SessionModel.user_id == user.id,
        SessionModel.revoked_at.is_(None),
    ).update({SessionModel.revoked_at: now}, synchronize_session=False)

    raw_token = new_session_token()
    session = SessionModel(
        id=hash_session_token(raw_token),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(seconds=settings.session_absolute_seconds),
        ip_address=client_ip(request),
        user_agent=request.headers.get('user-agent', '')[:1000] or None,
    )
    db.add(session)
    db.commit()

    cookie_kwargs = {
        'path': '/',
        'secure': settings.cookie_secure,
        'httponly': True,
        'samesite': settings.cookie_samesite,
        'max_age': settings.session_absolute_seconds,
    }
    response.set_cookie(settings.session_cookie_name, raw_token, **cookie_kwargs)

    csrf_token = new_csrf_token()
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        path='/',
        secure=settings.cookie_secure,
        httponly=False,
        samesite=settings.cookie_samesite,
        max_age=settings.session_absolute_seconds,
    )
    return csrf_token, session.expires_at


def revoke_current_session(request: Request, db: Session = Depends(get_db)) -> str | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    session = db.query(SessionModel).filter(
        SessionModel.id == hash_session_token(token),
        SessionModel.revoked_at.is_(None),
    ).first()
    if session:
        session.revoked_at = utc_now()
        db.commit()
    return token
