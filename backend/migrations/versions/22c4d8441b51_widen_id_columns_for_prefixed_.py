"""widen id columns for prefixed identifiers

Revision ID: 22c4d8441b51
Revises: 5f0cb2888d86
Create Date: 2026-11-19 10:16:13.711871

Prefixed IDs such as ``usr_<uuid>`` are 40+ characters, so the original
VARCHAR(36) columns reject them on PostgreSQL (SQLite does not enforce length).
"""

from alembic import op
import sqlalchemy as sa

revision = '22c4d8441b51'
down_revision = '5f0cb2888d86'
branch_labels = None
depends_on = None

COLUMNS = (
    ('audit_logs', 'id', False),
    ('audit_logs', 'user_id', True),
    ('business_records', 'id', False),
    ('business_records', 'created_by', True),
    ('recovery_codes', 'id', False),
    ('recovery_codes', 'user_id', False),
    ('security_tokens', 'id', False),
    ('security_tokens', 'user_id', False),
    ('security_tokens', 'issued_by', True),
    ('sessions', 'user_id', False),
    ('users', 'id', False),
)

NAMING_CONVENTION = {
    'ix': 'ix_%(column_0_label)s',
    'uq': 'uq_%(table_name)s_%(column_0_name)s',
    'ck': 'ck_%(table_name)s_%(column_0_name)s',
    'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
    'pk': 'pk_%(table_name)s',
}


def _widen(length: int) -> None:
    target = sa.String(length=length)
    for table, column, nullable in COLUMNS:
        with op.batch_alter_table(
            table,
            naming_convention=NAMING_CONVENTION,
        ) as batch:
            batch.alter_column(
                column,
                existing_type=sa.String(length=64 if length == 36 else 36),
                type_=target,
                existing_nullable=nullable,
            )


def upgrade() -> None:
    _widen(64)


def downgrade() -> None:
    _widen(36)
