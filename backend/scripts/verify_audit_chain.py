"""Verify the audit hash chain from the command line.

Usage (from the repository root):

    backend/.venv/bin/python backend/scripts/verify_audit_chain.py

Exit code 0 means every chained entry is intact; 1 means tampering or
corruption was detected. Unchained legacy records are reported separately.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app.audit import verify_chain  # noqa: E402
from backend.app.database import SessionLocal, init_db  # noqa: E402
from backend.app.models import AuditLog  # noqa: E402


def main() -> int:
    init_db()
    db = SessionLocal()
    try:
        result = verify_chain(db)
        legacy = db.query(AuditLog).filter(AuditLog.sequence_number.is_(None)).count()
    finally:
        db.close()

    print(f"Checked {result['checked']} chained audit entries ({legacy} unchained legacy entries).")
    if result['valid']:
        print('Audit chain is intact.')
        return 0
    print(f"Hash chain mismatch at sequence {result['first_invalid_sequence']}.", file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
