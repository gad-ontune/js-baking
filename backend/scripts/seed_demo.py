"""Create the local demo accounts used by the React sign-in screen.

These are PUBLIC development-only credentials. They are deliberately long
enough to satisfy the backend password policy, and this script refuses to run
in a production environment unless JSBH_ALLOW_DEMO_SEED=true is set explicitly.

Usage (from the repository root):

    backend/.venv/bin/python backend/scripts/seed_demo.py

Optional environment overrides: JSBH_DEMO_OWNER_PASSWORD,
JSBH_DEMO_STAFF_PASSWORD, JSBH_DEMO_MANAGER_PASSWORD.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.config import settings  # noqa: E402
from backend.app.database import SessionLocal, init_db  # noqa: E402
from backend.app.models import User  # noqa: E402
from backend.app.security import hash_password, new_id, password_policy_error  # noqa: E402

# Dev-only values, mirrored in src/lib/demoCredentials.js for the demo buttons.
DEMO_ACCOUNTS = (
    ('Amina Otieno', 'amina', 'amina@jsbakinghouse.co.ke', 'JSBH-Owner-2026', 'owner', 'JSBH_DEMO_OWNER_PASSWORD'),
    ('Brian Kiptoo', 'brian', 'brian@jsbakinghouse.co.ke', 'JSBH-Staff-2026', 'staff', 'JSBH_DEMO_STAFF_PASSWORD'),
    ('Wanjiku Njeri', 'wanjiku', 'wanjiku@jsbakinghouse.co.ke', 'JSBH-Manager-2026', 'manager', 'JSBH_DEMO_MANAGER_PASSWORD'),
)


def main() -> int:
    if settings.is_production and os.environ.get('JSBH_ALLOW_DEMO_SEED', '').lower() != 'true':
        print(
            'Refusing to seed public demo credentials in production. '
            'Set JSBH_ALLOW_DEMO_SEED=true only for an isolated demo deployment.',
            file=sys.stderr,
        )
        return 2

    init_db()
    db = SessionLocal()
    created = []
    skipped = []
    try:
        for name, username, email, default_password, role, env_name in DEMO_ACCOUNTS:
            password = os.environ.get(env_name) or default_password
            error = password_policy_error(password)
            if error:
                print(f'Password for {username} rejected: {error}', file=sys.stderr)
                return 2
            if db.query(User).filter(User.username == username).first():
                skipped.append(username)
                continue

            db.add(User(
                id=new_id('usr_'),
                name=name,
                username=username,
                email=email,
                password_hash=hash_password(password),
                role=role,
                active=True,
            ))
            created.append(username)

        if created:
            db.commit()
        print(f'Created demo accounts: {", ".join(created) or "none"}')
        if skipped:
            print(f'Skipped existing usernames: {", ".join(skipped)}')
        print('These credentials are for local development only. Never deploy them.')
        return 0
    finally:
        db.close()


if __name__ == '__main__':
    raise SystemExit(main())
