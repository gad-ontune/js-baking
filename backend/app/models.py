from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Index, String, Text
from sqlalchemy import JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .security import utc_now


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (
        CheckConstraint("role IN ('owner', 'manager', 'staff')", name='ck_users_role'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # One-way hash only. Passwords are never stored or displayed in readable form.
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default='staff')
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Fernet-encrypted TOTP secret; never exposed after initial enrolment.
    mfa_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)

    sessions: Mapped[list['Session']] = relationship(back_populates='user', cascade='all, delete-orphan')


class Session(Base):
    __tablename__ = 'sessions'
    __table_args__ = (
        Index('ix_sessions_user_id', 'user_id'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates='sessions')


class BusinessRecord(Base):
    """Typed business data. Payloads are validated by Pydantic at the API edge.

    Keeping records in one append-oriented table lets the API apply consistent
    permission and audit rules across every business module while preserving
    the exact field shapes the existing SPA uses.
    """

    __tablename__ = 'business_records'
    __table_args__ = (
        CheckConstraint(
            "kind IN ('inventory', 'movement', 'supplier', 'product', 'purchase', 'sale', 'expense', 'production')",
            name='ck_business_records_kind',
        ),
        Index('ix_business_records_kind', 'kind'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    __table_args__ = (
        Index('ix_audit_logs_created_at', 'created_at'),
        UniqueConstraint('sequence_number', name='uq_audit_logs_sequence_number'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default='success')
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    old_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
    # Append-only hash chain. Each entry commits to the previous entry's hash.
    sequence_number: Mapped[int | None] = mapped_column(nullable=True)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entry_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class SecurityToken(Base):
    """Single-use, short-lived token hash for recovery and verification flows.

    Only the SHA-256 digest of the random token is stored. The plaintext token
    is returned to the caller exactly once and is never written to the database
    or to audit logs.
    """

    __tablename__ = 'security_tokens'
    __table_args__ = (
        CheckConstraint(
            "kind IN ('password_reset', 'email_verification', 'mfa_challenge')",
            name='ck_security_tokens_kind',
        ),
        UniqueConstraint('token_hash', name='uq_security_tokens_token_hash'),
        Index('ix_security_tokens_user_id', 'user_id'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    issued_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)


class RecoveryCode(Base):
    """Hashed single-use substitutes for a TOTP code during sign-in."""

    __tablename__ = 'recovery_codes'
    __table_args__ = (
        UniqueConstraint('code_hash', name='uq_recovery_codes_code_hash'),
        Index('ix_recovery_codes_user_id', 'user_id'),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now)
