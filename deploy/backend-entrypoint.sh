#!/bin/sh
# Startup tasks for the API container. Everything runs before the first
# worker accepts traffic, so a failed provisioning, migration or grant stops
# the deployment.
set -eu

cd /app/backend

# 1. Create the dedicated schema-owner and runtime roles (no-op on SQLite).
if [ -n "${BOOTSTRAP_DATABASE_URL:-}" ]; then
  echo '[jsbh] Provisioning database roles...'
  python /app/backend/scripts/provision_database.py
fi

# 2. Apply migrations as the schema owner, never as the runtime API role.
echo '[jsbh] Applying database migrations...'
alembic upgrade head

# 3. Refresh grants so new tables are covered and audit_logs stays append-only.
if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
  echo '[jsbh] Applying least-privilege runtime grants...'
  python /app/backend/scripts/grant_runtime_permissions.py
fi

# Optional one-time bootstrap of the first owner, from environment variables.
# Exit code 1 means the username already exists and is not an error on restart.
if [ -n "${SEED_OWNER_USERNAME:-}" ] || [ -n "${SEED_OWNER_PASSWORD:-}" ]; then
  echo '[jsbh] Checking initial owner account...'
  set +e
  python /app/backend/scripts/create_owner.py
  owner_status=$?
  set -e
  case "$owner_status" in
    0|1) ;;
    *) echo "[jsbh] Owner bootstrap failed (exit $owner_status)." >&2; exit "$owner_status" ;;
  esac
fi

# Demo mode is opt-in only and refuses to run without JSBH_ALLOW_DEMO_SEED.
if [ "${JSBH_ALLOW_DEMO_SEED:-}" = 'true' ]; then
  echo '[jsbh] Seeding demo data (explicit demo mode)...'
  python /app/backend/scripts/seed_demo.py
fi

echo '[jsbh] Starting API workers...'
exec uvicorn backend.app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers "${JSBH_API_WORKERS:-2}" \
  --no-access-log
