"""Create the dedicated database roles used by the deployment.

Run by the backend entrypoint before Alembic. It connects with the bootstrap
superuser credentials (never used by the application at runtime) and creates a
schema-owner role for migrations and a restricted role for the API. It is a
no-op for local SQLite development.

Passwords are supplied only through the environment and are never printed.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402

from backend.app.config import settings  # noqa: E402

MIN_PASSWORD_LENGTH = 20


def _psycopg_dsn(url: str) -> str:
    """SQLAlchemy's driver suffix is not understood by psycopg's connect()."""
    return url.replace('postgresql+psycopg://', 'postgresql://', 1)


def _password(env_name: str, label: str) -> str:
    value = os.environ.get(env_name, '')
    if len(value) < MIN_PASSWORD_LENGTH:
        raise SystemExit(
            f'{env_name} must contain at least {MIN_PASSWORD_LENGTH} characters '
            f'for the {label} role.'
        )
    return value


def _ensure_role(conn: psycopg.Connection, role: str, password: str) -> None:
    statement = sql.SQL('CREATE ROLE {} LOGIN PASSWORD {}').format(
        sql.Identifier(role), sql.Literal(password)
    )
    if conn.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (role,)).fetchone():
        statement = sql.SQL('ALTER ROLE {} WITH LOGIN PASSWORD {}').format(
            sql.Identifier(role), sql.Literal(password)
        )
    conn.execute(statement)


def main() -> int:
    bootstrap_url = settings.bootstrap_url
    if bootstrap_url.startswith('sqlite') or bootstrap_url == settings.database_url:
        print('[jsbh] Local/single-role database; role provisioning skipped.')
        return 0

    owner_role = os.environ.get('JSBH_OWNER_USER', 'jsbh_owner')
    app_role = os.environ.get('JSBH_APP_USER', 'jsbh_app')
    owner_password = _password('JSBH_OWNER_PASSWORD', 'schema owner')
    app_password = _password('JSBH_APP_PASSWORD', 'runtime API')

    with psycopg.connect(_psycopg_dsn(bootstrap_url), autocommit=True) as conn:
        _ensure_role(conn, owner_role, owner_password)
        _ensure_role(conn, app_role, app_password)
        # Only the owner role may create schema objects. The API role gets
        # table-level grants after each migration (grant_runtime_permissions).
        conn.execute(sql.SQL('GRANT ALL ON SCHEMA public TO {}').format(sql.Identifier(owner_role)))
        conn.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(app_role)))
        conn.execute('REVOKE ALL ON SCHEMA public FROM PUBLIC')

    print(f'[jsbh] Database roles ready ({owner_role} for migrations, {app_role} for the API).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
