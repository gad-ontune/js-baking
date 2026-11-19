"""Create the initial owner account from environment variables only.

Usage (from the repository root):

    SEED_OWNER_USERNAME=... SEED_OWNER_PASSWORD=... \
        backend/.venv/bin/python backend/scripts/create_owner.py

No credentials are stored in this file or in the repository.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.config import settings  # noqa: E402
from backend.app.database import SessionLocal, init_db  # noqa: E402
from backend.app.models import User  # noqa: E402
from backend.app.security import hash_password, new_id, password_policy_error  # noqa: E402


def main() -> int:
    username = settings.seed_owner_username.strip().lower()
    password = settings.seed_owner_password
    email = settings.seed_owner_email.strip() or None

    if not username or not password:
        print(
            'Set SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD in the backend environment.',
            file=sys.stderr,
        )
        return 2

    error = password_policy_error(password)
    if error:
        print(f'Owner password rejected: {error}', file=sys.stderr)
        return 2

    init_db()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            print('That username already exists. No changes were made.', file=sys.stderr)
            return 1

        owner = User(
            id=new_id('usr_'),
            name='Bakery Owner',
            username=username,
            email=email,
            password_hash=hash_password(password),
            role='owner',
            active=True,
        )
        db.add(owner)
        db.commit()
        print(f'Owner account created for {username}. Store the password in your secret manager only.')
        return 0
    finally:
        db.close()


if __name__ == '__main__':
    raise SystemExit(main())
