from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..auth import get_current_user, require_csrf, require_permissions
from ..database import get_db
from ..email_service import send_password_reset
from ..models import Session as SessionModel
from ..models import User
from ..ratelimit import rate_limiter
from ..schemas import ResetTokenResponse, RoleUpdate, StatusUpdate, UserCreate, UserResponse
from ..security import hash_password, new_id, utc_now
from ..tokens import issue_token

router = APIRouter(prefix='/users', tags=['users'])

manage_users = require_permissions('users.manage')


def _active_owner_count(db: Session) -> int:
    return db.query(User).filter(User.role == 'owner', User.active.is_(True)).count()


def _revoke_sessions(db: Session, user_id: str) -> None:
    db.query(SessionModel).filter(
        SessionModel.user_id == user_id,
        SessionModel.revoked_at.is_(None),
    ).update({SessionModel.revoked_at: utc_now()}, synchronize_session=False)


@router.get('', response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> list[User]:
    return db.query(User).order_by(User.created_at.asc()).all()


@router.post('', response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> User:
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='That username is already in use.')

    # Role and active status are deliberately never taken from the request.
    user = User(
        id=new_id('usr_'),
        name=payload.name,
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role='staff',
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    record_audit(
        db,
        request,
        event_type='USER',
        action='USER_CREATED',
        entity='User',
        entity_id=user.id,
        user_id=actor.id,
        new_values={'username': user.username, 'role': user.role, 'active': user.active},
    )
    return user


@router.patch('/{user_id}/role', response_model=UserResponse, dependencies=[Depends(require_csrf)])
def update_role(
    user_id: str,
    payload: RoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> User:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found.')

    if target.id == actor.id and payload.role != 'owner':
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='You cannot demote your own account.')
    # Only an active owner contributes to the invariant. Demoting an already
    # inactive owner does not reduce the number of usable owner accounts.
    target_leaves_owner_role = target.role == 'owner' and target.active and payload.role != 'owner'
    if target_leaves_owner_role and _active_owner_count(db) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='At least one active owner must remain.')

    previous_role = target.role
    target.role = payload.role
    if previous_role != payload.role:
        # A privilege change must force re-authentication on every device.
        _revoke_sessions(db, target.id)
    db.commit()
    record_audit(
        db,
        request,
        event_type='USER',
        action='USER_ROLE_CHANGED',
        entity='User',
        entity_id=target.id,
        user_id=actor.id,
        old_values={'role': previous_role},
        new_values={'role': payload.role},
    )
    db.refresh(target)
    return target


@router.patch('/{user_id}/status', response_model=UserResponse, dependencies=[Depends(require_csrf)])
def update_status(
    user_id: str,
    payload: StatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> User:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found.')

    if target.id == actor.id and not payload.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='You cannot deactivate your own account.')
    target_leaves_active_owners = target.role == 'owner' and target.active and not payload.active
    if target_leaves_active_owners and _active_owner_count(db) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='At least one active owner must remain.')

    previous = target.active
    target.active = payload.active
    if not payload.active:
        _revoke_sessions(db, target.id)
    db.commit()
    record_audit(
        db,
        request,
        event_type='USER',
        action='USER_DEACTIVATED' if not payload.active else 'USER_ACTIVATED',
        entity='User',
        entity_id=target.id,
        user_id=actor.id,
        old_values={'active': previous},
        new_values={'active': payload.active},
    )
    db.refresh(target)
    return target


@router.post('/{user_id}/revoke-sessions', status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def revoke_user_sessions(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> None:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found.')
    _revoke_sessions(db, target.id)
    record_audit(
        db,
        request,
        event_type='SESSION',
        action='SESSIONS_REVOKED',
        entity='User',
        entity_id=target.id,
        user_id=actor.id,
    )


@router.post('/{user_id}/reset-token', response_model=ResetTokenResponse, dependencies=[Depends(require_csrf)])
def issue_password_reset_token(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(manage_users),
) -> ResetTokenResponse:
    """Owner issues a one-time recovery code for a staff or manager account.

    Stored passwords are one-way Argon2id hashes and can never be displayed.
    The code is returned to the owner exactly once, delivered by email when
    SMTP is configured, and all existing sessions are revoked immediately.
    """
    rate_limiter.check(f'reset-token:owner:{actor.id}', 10, 900)
    target = db.query(User).filter(User.id == user_id, User.active.is_(True)).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found.')

    token, record = issue_token(db, target, 'password_reset', issued_by=actor.id)
    delivered = False
    if target.email:
        delivered = send_password_reset(target.email, token, owner_initiated=True)
    _revoke_sessions(db, target.id)
    rate_limiter.record(f'reset-token:owner:{actor.id}')

    record_audit(
        db,
        request,
        event_type='USER',
        action='RESET_TOKEN_ISSUED',
        entity='User',
        entity_id=target.id,
        user_id=actor.id,
        details=f'One-time password reset code issued for {target.username}; token value omitted',
    )
    return ResetTokenResponse(
        token=token,
        expires_at=record.expires_at,
        email_sent=delivered,
        message=(
            'Give this one-time code to the user. It expires soon and works once. '
            'It will not be shown again.'
        ),
    )
