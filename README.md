# JS Baking House — Business Suite

A polished, responsive internal management application for a cake bakery and juice business. It brings inventory, purchasing, suppliers, production, sales, expenses, reports and settings into one calm workspace.

The application is built around the supplied Software Requirements Specification and includes realistic seeded data so the client can immediately explore every workflow.

---

## Quick start

Authentication **and business data** are handled by the FastAPI backend. Run both servers:

```bash
# Backend (security API)
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/python backend/scripts/seed_demo.py
backend/.venv/bin/python backend/scripts/seed_business.py
backend/.venv/bin/python -m uvicorn backend.app.main:app --port 8000

# Frontend, in a second terminal
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` to `http://127.0.0.1:8000`; override the target with `VITE_API_TARGET` if needed. If the API is not running, the sign-in screen shows an "API unavailable" message.

### Demo accounts (local development only)

These accounts are created by `backend/scripts/seed_demo.py`. The one-click buttons on the sign-in screen fill the credentials for you.

| Role | Username | Password | Access |
|---|---|---|---|
| Owner | `amina` | `JSBH-Owner-2026` | Full access, including users and audit |
| Manager | `wanjiku` | `JSBH-Manager-2026` | Daily operations and basic reports |
| Staff | `brian` | `JSBH-Staff-2026` | Operational modules only |

**These are public demo credentials. Never deploy them.** For a real deployment, create an owner with `backend/scripts/create_owner.py` using environment-only credentials and do not run the demo seeder.

### Production build

```bash
npm run build
npm run preview
```

`npm run preview` is only a local preview of the built SPA. For a deployed
stack, use the Docker Compose setup below so the API, database and cache run
with production settings.

---

## What is included

### 1. Dashboard
- Today's sales, expenses and estimated profit
- Monthly revenue, expenses and estimated profit
- Inventory value, low stock, out-of-stock and expiry summaries
- Sales performance and revenue-vs-expenses charts
- Inventory distribution and best-selling product charts
- Low-stock, expiry and unusually-high-expense alerts
- Dynamic notification centre with unread tracking, filters and device delivery
- Chronological recent activity across purchases, sales, expenses, stock changes and production

### 2. Inventory management
- Add, edit, search, filter and archive items
- Configurable categories, units, thresholds and expiry dates
- Record purchases, sales, wastage and adjustments
- Full stock movement ledger with previous/new quantities, reason, user and reference
- Low-stock and expiry tracking pages with quick receipt and write-off workflows

### 3. Purchases & suppliers
- Supplier directory with contact details, purchase history and status
- Multi-item purchase entry with discounts, charges and notes
- Stock movements automatically created when a purchase is confirmed
- Supplier payments with paid amount, outstanding balance and statuses
- Voiding reverses stock and balances while preserving an audit record

### 4. Production management
- Simple production records for cakes, cupcakes, juices and other products
- Search, filter, edit and summarize production history
- Clearly separated from ingredient stock — no automatic recipe consumption, as required by the specification

### 5. Sales & expenses
- Multi-product sales with discounts, payment methods and notes
- Product field is writable: choose an existing product or type a new one, which is added to the catalogue automatically
- Configured product costs used for COGS and profit calculations
- Finished-product stock deduction for tracked products
- Negative stock prevention
- Sale correction/voiding with stock restoration and audit history
- Categorized expenses with payment methods, analytics and alerts

### 6. Reports & analytics
- Financial, inventory, purchase, product performance and production reports
- Today / yesterday / 7 days / 30 days / this month / previous month / custom ranges
- Printable reports (use the browser's *Save as PDF*)
- Excel-compatible CSV exports with reporting period and generation date
- Profit basis indicator showing whether recorded product costs are complete

### 7. Settings
- Business profile, currency, logo initials and expiry warning period
- User accounts and owner/staff role permissions
- Manage inventory, product and expense categories, payment methods, units and movement types
- Product cost and selling price configuration
- Audit history of important activities
- Restore original demo data

---

## Design direction

The interface uses a warm neutral canvas, deep charcoal text, bakery-brown accents, soft green positives, amber warnings and red critical alerts. It follows the specification's direction: clear navigation, summary cards, dense-but-readable tables, modal forms and minimal decorative noise.

The shell is fully responsive: a collapsible sidebar on desktop and a slide-out drawer on small screens. Reports include dedicated print styling.

### Notification centre and device notifications

The bell menu and the dedicated **Notifications** page share one live inbox:

- Open alerts are derived from the authoritative business snapshot whenever stock or expiry status changes.
- The notification provider owns the sync, so the bell menu and the dedicated page never depend on one screen being open.
- Read/resolved state is stored per signed-in user; another account's inbox is never inherited.
- Each notification has a read/unread state, severity, timestamp and related page.
- Use **Mark all as read**, per-item read/unread toggles, dismiss, clear-read and clear-all actions.
- Filter by All / Unread / Read / Resolved and by severity, or search the inbox.
- **Refresh from inventory** rebuilds the inbox from current data if you cleared it or want to re-sync.
- Send a **Test** notification to confirm delivery before relying on stock alerts.

Device delivery uses the built-in Notification API through a registered service worker, so new alerts can appear in the device notification centre even when the app tab is in the background. Clicking a device notification opens the relevant page (or the notification centre).

1. Open the bell menu or the Notifications page.
2. Click **Enable device alerts** and allow access when prompted.
3. Optionally install the app to the device home screen from the browser menu for an app-like experience.
4. Click **Send test** to confirm that a notification arrives on the device.

The first sync after the server snapshot loads seeds existing alerts into the inbox without sending a burst of historical alerts to the device. Only genuinely new alerts are delivered afterwards. Device notifications require a secure context (`localhost` or HTTPS); if permission is denied, the in-app inbox continues to work and the UI explains how to re-enable it.

---

## Project structure

```text
src/
  components/       Reusable UI, app shell, report shell
  lib/              API client, permission map, demo credentials, seed data, analytics, formatting and persistence store
  pages/
    Notifications.jsx  Dedicated notification centre
    inventory/
    purchases/
    production/
    sales/
    reports/
    settings/
  App.jsx           Routes and permission guards
  main.jsx          App entry point
backend/
  app/              FastAPI routers, RBAC, audit chain, MFA, email, rate limiting and anomaly alerts
  migrations/       Alembic revisions (schema authority for PostgreSQL)
  scripts/          Owner bootstrap, demo seeding, audit-chain and DB-hardening verification, Argon2 benchmark
deploy/             Dockerfiles, nginx templates, backup/restore scripts, demo env and TLS helpers
docker-compose.yml                 Base stack (PostgreSQL, Redis, API, nginx, encrypted backups)
docker-compose.demo.yml            Public demo overlay with seeded data
docker-compose.tls.yml             HTTPS, HSTS, HTTP→HTTPS redirect and certbot overlay
docker-compose.trusted-proxy.yml   Optional overlay for an upstream proxy/CDN
ASVS_EVIDENCE.md                   Self-assessment evidence and pentest preparation
```

Authentication, the account directory, audit records **and all business collections** come from the FastAPI backend through `src/lib/api.js`. The SPA hydrates inventory, movements, suppliers, products, purchases, sales, expenses and production from `GET /business/snapshot` and performs every write through the business endpoints; it never computes totals, stock levels, references or reversal state itself. `localStorage` under `js-baking-house-v3` is now only an offline fallback for unauthenticated demo browsing. Route guards use `src/lib/permissions.js`, which mirrors the backend role map, but the backend remains the only authority for whether an action is allowed. No password is stored in browser storage.

Run `backend/scripts/seed_business.py` after `seed_demo.py` to populate a local demo dataset. It is idempotent, refuses to run in production unless explicitly overridden, and generates the data through the same service layer as the API so all stock effects and totals are server-computed.

---

## Business rules implemented

- Purchases increase stock; they are **not** treated as operating expenses.
- Revenue comes only from valid, non-voided sales.
- COGS uses configured product costs recorded on each sale.
- Gross profit = revenue − COGS.
- Net operating profit = gross profit − operating expenses.
- Profit figures are labelled as estimates when cost coverage is incomplete.
- Every stock change creates a movement record.
- Voided purchases and sales reverse stock effects and retain audit history.
- Duplicate reference numbers are generated from sequential counters.
- Negative stock is prevented on sales and manual movements.

---

## Backend security API and SPA integration

The FastAPI backend under `backend/` is connected to the React sign-in, route guards, user management, audit pages **and business pages**. Inventory, suppliers, products, purchases, sales, expenses, production and stock movements are served by a generic business-record API with strict Pydantic validation at the edge, server-computed stock/totals, object-level ownership checks and reversal-only cancellation. Reports are derived in the SPA from the server-provided collections.

```bash
# Install backend dependencies (dev + tests + scanners)
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt

# Run the API locally
backend/.venv/bin/python -m uvicorn backend.app.main:app --port 8000

# Local demo accounts (public dev-only credentials)
backend/.venv/bin/python backend/scripts/seed_demo.py

# Or create a real first owner from environment-only credentials
# (no password is ever stored in the repository or the browser)
SEED_OWNER_USERNAME=... SEED_OWNER_PASSWORD=... SEED_OWNER_EMAIL=... \
  backend/.venv/bin/python backend/scripts/create_owner.py

# Verify everything
npm run verify && npm run verify:backend
```

The API exposes `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/change-password`, `GET /api/v1/auth/me`, owner-only user management under `/api/v1/users`, a read-only `/api/v1/audit`, `/health`, and the business API under `/api/v1/business`.

Recovery and verification endpoints:

- `POST /auth/forgot-password` — owner-only; verifies username **and** registered email, then emails a single-use code (SMTP required in production).
- `POST /auth/reset-password` — exchanges a one-time code for a new password and revokes all sessions.
- `POST /users/{id}/reset-token` — owner issues a one-time code for a staff/manager account; passwords are never displayed because only Argon2id hashes exist.
- `POST /auth/email/verification-code` and `POST /auth/email/verify` — verify an account email with a single-use code.
- `POST /auth/mfa/setup`, `/mfa/enable`, `/mfa/disable`, `/mfa/complete` — TOTP enrolment and challenge login with hashed one-time recovery codes.
- `GET /audit/verify` — recomputes the append-only audit hash chain (owner only).

Security alerts are derived from committed audit events: repeated failed
sign-ins, role/status changes, recovery-code issuance and audit-chain failures
send one deduplicated email and/or HTTPS webhook notification. Configure
`ALERT_EMAIL_TO` and/or `ALERT_WEBHOOK_URL`; with Redis configured, deduplication
is shared across API workers. The chain is also re-verified periodically in
production. No tokens, passwords or MFA secrets are included in alerts.

Generic responses are used for unknown accounts so the recovery endpoint cannot be used to enumerate users. In production, unconfigured SMTP or MFA encryption fails closed instead of silently issuing unusable codes.

Business endpoints:

- `GET /business/snapshot` and `GET /business/{kind}` — role-filtered reads.
- `POST /business/{kind}` and `PATCH /business/{kind}/{id}` — validated create/update.
- `POST /business/{kind}/{id}/reverse` — reversal that preserves history (no DELETE route).
- `POST /business/inventory/{id}/movement` — server-derived stock delta.
- `POST /business/purchase/{id}/payment` — balance/status calculated on the server.

Staff may only update or reverse records they created; managers and owners may act on any record. A 404 is returned for another user's record so its existence is not disclosed. Authentication uses Argon2id hashes and server-managed HttpOnly cookies with double-submit CSRF tokens; there is no JWT and no credential in `localStorage` on the backend side. The SPA sends `credentials: 'include'` and copies only the CSRF cookie into a header.

## Deployment with Docker Compose

The stack serves the built SPA from an unprivileged nginx container and proxies
`/api` to the FastAPI container on the **same origin**, so session cookies stay
first-party. PostgreSQL and Redis are on an internal network and are not
published to the host. Both application images run as a non-root user.

### 1. Configure secrets

```bash
cp .env.example .env
```

Fill in every required value; the stack fails closed when a required secret is
missing.

| Variable group | Purpose |
|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | Bootstrap database superuser and Redis auth. |
| `JSBH_OWNER_PASSWORD`, `JSBH_APP_PASSWORD` | Separate Alembic schema-owner and runtime API roles; each **at least 20 URL-safe characters**. The bootstrap credential is never used by the API. |
| `BACKUP_PASSPHRASE` | At least 20 characters; encrypts database dumps with AES-256. Store it separately from `.env`. |
| `RCLONE_REMOTE` **or** `ALLOW_LOCAL_ONLY_BACKUPS=true` | Backups refuse to run unless an off-site rclone destination is configured or local-only demo use is explicitly accepted. Mount the rclone config at `/config/rclone/rclone.conf` for off-site copies. |
| `SMTP_HOST`, `SMTP_FROM`, `SMTP_*` | Required in production for owner recovery and email verification. |
| `MFA_ENCRYPTION_KEY` | Base64-urlsafe 32-byte Fernet key: `python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"`. |
| `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_SECURE` | Set to the public HTTPS origin; keep `COOKIE_SECURE=true`. |
| `ALERT_EMAIL_TO`, `ALERT_WEBHOOK_URL` | At least one destination enables audit anomaly alerts. Webhooks require HTTPS in production. |
| `TLS_DOMAIN`, `TLS_EMAIL`, `TLS_CERT_DIR` | Used by the HTTPS overlay below. |
| `SEED_OWNER_*` | Optional one-time first-owner bootstrap. Never commit these values. |

Before finalising hashing settings, benchmark Argon2id on the target instance:

```bash
backend/.venv/bin/python backend/scripts/benchmark_argon2.py --samples 5 --target-ms 500
```

The defaults (`m=19456 KiB, t=2, p=1`) follow the OWASP baseline. Change them
only after measuring real login latency on production-class hardware.

### 2. Build and start

```bash
docker compose up --build -d

docker compose logs -f backend
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose exec backend alembic current
docker compose exec backend python backend/scripts/verify_audit_chain.py
docker compose down          # stop without deleting data volumes
```

Schema changes are owned by Alembic: the backend entrypoint provisions roles,
runs `alembic upgrade head`, refreshes least-privilege grants, and only then
starts workers. `AUTO_CREATE_SCHEMA=false` prevents the API from creating or
altering tables at runtime.

### Database roles and audit protection

Three database identities are used:

- **Bootstrap** (`BOOTSTRAP_DATABASE_URL`) exists only to create roles and is
  never used by the application at runtime.
- **Schema owner** (`jsbh_owner`, via `MIGRATION_DATABASE_URL`) is the only role
  allowed to run Alembic migrations.
- **Runtime API** (`jsbh_app`, via `DATABASE_URL`) has table-level
  `SELECT/INSERT/UPDATE/DELETE` but no schema-creation rights and no
  `UPDATE`/`DELETE`/`TRUNCATE` on `audit_logs`.

Every connection uses `sslmode=require` against PostgreSQL with internal TLS.
A database trigger rejects any attempt to modify an audit row, even by the
bootstrap role. Verify the deployed configuration with:

```bash
docker compose run --rm --entrypoint python backend \
  backend/scripts/verify_database_hardening.py
```

### Encrypted backups and restore drill

The backup service runs `pg_dump -Fc`, encrypts with GPG AES-256, writes a
SHA-256 checksum, verifies the ciphertext decrypts, and keeps 14 daily, 8
weekly and 12 monthly copies. It also runs once at startup and follows
`BACKUP_CRON`. Off-site sync uses rclone and is verified after each run.

```bash
docker compose logs -f backup
docker compose exec backup sh -c 'ls -la /backups/daily'

# Rehearse a restore into a throwaway database and compare with live data
BACKUP_ENV_FILE=.env deploy/restore-drill.sh
# For the demo stack:
# BACKUP_ENV_FILE=deploy/demo.env.example \
#   BACKUP_EXTRA_FILES='-f docker-compose.demo.yml' deploy/restore-drill.sh
```

The drill takes a fresh encrypted backup by default (pass a backup file as an
argument to test an older copy), then checks the checksum, decrypts it,
restores it into a throwaway database, verifies the audit chain and compares
row counts for `users`, `business_records`, `audit_logs` and `sessions`.

### HTTPS, HSTS and edge filtering

The base stack listens on `${WEB_PORT:-8080}` over HTTP. Add the TLS overlay for
HTTPS termination, an HTTP→HTTPS redirect, HSTS and certbot webroot support:

```bash
TLS_DOMAIN=bakery.example.com TLS_EMAIL=ops@example.com \
  docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

This publishes ports 80 and 443 and loads certificates from
`${TLS_CERT_DIR:-./deploy/certs}/live/$TLS_DOMAIN/`. certbot renews them into
that directory and the nginx user (UID 10001) is given read access. For a local
self-signed smoke test only:

```bash
deploy/generate-dev-cert.sh /tmp/jsbh-tls localhost
TLS_DOMAIN=localhost TLS_EMAIL=dev@example.com TLS_CERT_DIR=/tmp/jsbh-tls \
  docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

`deploy/generate-dev-cert.sh` is **never** for production. If an upstream proxy
or CDN terminates TLS, use the trusted-proxy overlay instead and restrict
nginx to the proxy network:

```bash
TRUSTED_PROXY_CIDR=10.0.0.0/8 \
  docker compose -f docker-compose.yml -f docker-compose.trusted-proxy.yml up -d
```

nginx templates render at container start. The edge rules reject disallowed
methods, dotfiles, backup extensions, path traversal, null bytes and common
scanner user agents; the authoritative rate limits remain in the API/Redis.

### Automated security smoke test

```bash
# Base HTTP demo
BASE_URL=http://127.0.0.1:8080 deploy/security-smoke.sh

# Local TLS smoke (self-signed)
BASE_URL=https://127.0.0.1:18443 HTTP_URL=http://127.0.0.1:18080 \
  EXPECT_TLS=true INSECURE_TLS=true deploy/security-smoke.sh

# Real deployment: omit INSECURE_TLS so the certificate must validate
BASE_URL=https://bakery.example.com HTTP_URL=http://bakery.example.com \
  EXPECT_TLS=true deploy/security-smoke.sh
```

The script is read-only apart from intentionally failed logins and checks
authentication boundaries, WAF filters, rate limiting, security headers, HSTS,
redirects and absence of demo credentials in the public HTML.

### Docker demo (clean local setup)

The public demo credentials are disabled in the production stack. To spin up a
complete demo with data and development one-time codes:

```bash
cp deploy/demo.env.example .env
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
# open http://localhost:8080
```

`docker compose ... down -v` removes the demo volumes. The demo seeder only
creates accounts that do not exist and never overwrites an existing dataset;
owners can also restore the original business records from **Settings → Audit**
via the owner-only, CSRF-protected demo reset endpoint (disabled in production).

### Verification commands

```bash
npm run verify             # frontend tests, lint, production build, npm audit
npm run verify:backend     # backend tests, pip-audit, Bandit
cd backend && alembic upgrade head && alembic check
docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.demo.yml config --quiet
TLS_DOMAIN=localhost TLS_EMAIL=dev@example.com \
  docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.tls.yml config --quiet
docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.demo.yml run --rm \
  --entrypoint python backend backend/scripts/verify_database_hardening.py
BACKUP_ENV_FILE=deploy/demo.env.example BACKUP_EXTRA_FILES='-f docker-compose.demo.yml' deploy/restore-drill.sh
```

CI runs the test, lint, build, dependency and static-analysis gates on every
push, plus Gitleaks, Semgrep, Compose config validation for all overlays and a
`compose-smoke` job that starts the demo stack, verifies database hardening and
runs `deploy/security-smoke.sh`.

`SECURITY_ASSESSMENT.md` contains the full audit and implementation record.
`ASVS_EVIDENCE.md` records the self-assessment evidence, operator steps and
penetration-test preparation. The controls are implemented and verified
locally, but a trusted certificate, off-site backups, target-hardware
benchmarking and independent ASVS/pentest review remain before any
production-hardened or compliant claim can be made.

The visual identity is built with typography, colour and inline icons. Small PNG icons in `public/` are used only for PWA installation and device notifications.

---

**Version:** 1.0 · **Default currency:** KES · **Status:** API-backed application with RBAC, MFA, recovery, audit chaining, Alembic and a Docker Compose deployment stack
