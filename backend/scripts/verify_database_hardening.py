"""Verify the production database separation and encryption in transit.

Designed to be run against a deployed stack:

    docker compose run --rm --entrypoint python backend \
        backend/scripts/verify_database_hardening.py

Exits 0 when every check passes and 1 otherwise. It never modifies data.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import psycopg  # noqa: E402

from backend.app.config import settings  # noqa: E402


def _psycopg_dsn(url: str) -> str:
    return url.replace('postgresql+psycopg://', 'postgresql://', 1)


def main() -> int:
    if settings.bootstrap_url.startswith('sqlite') or settings.bootstrap_url == settings.database_url:
        print('SKIP: local single-role database has no deployment hardening to verify.')
        return 0

    owner_role = os.environ.get('JSBH_OWNER_USER', 'jsbh_owner')
    app_role = os.environ.get('JSBH_APP_USER', 'jsbh_app')
    failures: list[str] = []

    with psycopg.connect(_psycopg_dsn(settings.bootstrap_url), autocommit=True) as conn:
        ssl = conn.execute(
            'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
        ).fetchone()
        if not ssl or not ssl[0]:
            failures.append('database connection is not encrypted (ssl = off)')

        for role in (owner_role, app_role):
            if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (role,)).fetchone():
                failures.append(f'role {role} is missing')

        checks = {
            f'{app_role} may insert audit events': (
                "SELECT has_table_privilege(%s, 'audit_logs', 'INSERT')", app_role,
                True,
            ),
            f'{app_role} cannot update audit events': (
                "SELECT has_table_privilege(%s, 'audit_logs', 'UPDATE')", app_role,
                False,
            ),
            f'{app_role} cannot delete audit events': (
                "SELECT has_table_privilege(%s, 'audit_logs', 'DELETE')", app_role,
                False,
            ),
            f'{app_role} cannot create schema objects': (
                "SELECT has_schema_privilege(%s, 'public', 'CREATE')", app_role,
                False,
            ),
            f'{owner_role} can create schema objects': (
                "SELECT has_schema_privilege(%s, 'public', 'CREATE')", owner_role,
                True,
            ),
        }
        for label, (query, role, expected) in checks.items():
            actual = bool(conn.execute(query, (role,)).fetchone()[0])
            if actual != expected:
                failures.append(f'{label} (expected {expected}, got {actual})')

        trigger = conn.execute(
            """
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = 'audit_logs'::regclass
              AND tgname = 'jsbh_audit_append_only'
              AND NOT tgisinternal
            """
        ).fetchone()
        if not trigger:
            failures.append('audit_logs append-only trigger is missing')

    for label, ok in (
        ('encrypted database connection', not any('encrypted' in f for f in failures)),
        ('dedicated roles and least privilege', not any('role' in f or 'cannot' in f or 'may ' in f for f in failures)),
        ('append-only audit trigger', not any('trigger' in f for f in failures)),
    ):
        print(f'[{"PASS" if ok else "FAIL"}] {label}')

    if failures:
        for failure in failures:
            print(f'  - {failure}', file=sys.stderr)
        return 1
    print('All database hardening checks passed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
