"""Grant the minimum table permissions to the runtime API role.

Run by the backend entrypoint after Alembic, so newly created tables are
covered. The audit table is explicitly append-only: the API role can insert
events but cannot update or delete them, and a database trigger enforces that
for every role.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from psycopg import sql  # noqa: E402

from backend.app.config import settings  # noqa: E402

AUDIT_TABLE = 'audit_logs'


def _psycopg_dsn(url: str) -> str:
    return url.replace('postgresql+psycopg://', 'postgresql://', 1)


def main() -> int:
    migration_url = settings.migration_url
    if migration_url.startswith('sqlite') or migration_url == settings.database_url:
        print('[jsbh] Local/single-role database; runtime grants skipped.')
        return 0

    owner_role = os.environ.get('JSBH_OWNER_USER', 'jsbh_owner')
    app_role = os.environ.get('JSBH_APP_USER', 'jsbh_app')

    # Checked with psycopg so the DSN is never passed to a shell command.
    import psycopg

    with psycopg.connect(_psycopg_dsn(migration_url), autocommit=True) as conn:
        conn.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(app_role)))
        conn.execute(
            sql.SQL('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}')
            .format(sql.Identifier(app_role))
        )
        conn.execute(
            sql.SQL('GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO {}')
            .format(sql.Identifier(app_role))
        )
        conn.execute(
            sql.SQL('REVOKE UPDATE, DELETE, TRUNCATE ON {} FROM {}')
            .format(sql.Identifier(AUDIT_TABLE), sql.Identifier(app_role))
        )
        conn.execute(
            sql.SQL(
                'ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public '
                'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}'
            ).format(sql.Identifier(owner_role), sql.Identifier(app_role))
        )
        conn.execute(
            """
            CREATE OR REPLACE FUNCTION jsbh_prevent_audit_mutation() RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'audit_logs is append-only';
            END;
            $$ LANGUAGE plpgsql
            """
        )
        conn.execute('DROP TRIGGER IF EXISTS jsbh_audit_append_only ON audit_logs')
        conn.execute(
            """
            CREATE TRIGGER jsbh_audit_append_only
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION jsbh_prevent_audit_mutation()
            """
        )

    print(f'[jsbh] Runtime grants applied; {AUDIT_TABLE} is append-only for {app_role}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
