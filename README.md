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

- Open alerts are synchronised from inventory data whenever stock or expiry status changes.
- Each notification has a read/unread state, severity, timestamp and related page.
- Use **Mark all as read**, per-item read/unread toggles, dismiss, clear-read and clear-all actions.
- Filter by All / Unread / Read / Resolved and by severity, or search the inbox.
- Send a **Test** notification to confirm delivery before relying on stock alerts.

Device delivery uses the built-in Notification API through a registered service worker, so new alerts can appear in the device notification centre even when the app tab is in the background. Clicking a device notification opens the relevant page (or the notification centre).

1. Open the bell menu or the Notifications page.
2. Click **Enable device alerts** and allow access when prompted.
3. Optionally install the app to the device home screen from the browser menu for an app-like experience.
4. Click **Send test** to confirm that a notification arrives on the device.

The first sync seeds existing demo alerts into the inbox without sending a burst of old alerts to the device. Only genuinely new alerts are delivered. Device notifications require a secure context (`localhost` or HTTPS); if permission is denied, the in-app inbox continues to work and the UI explains how to re-enable it.

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
cp backend/.env.example backend/.env      # then edit it, never commit it
SEED_OWNER_USERNAME=... SEED_OWNER_PASSWORD=... \
  backend/.venv/bin/python backend/scripts/create_owner.py

# Verify everything
npm run verify && npm run verify:backend
```

The API exposes `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/change-password`, `GET /api/v1/auth/me`, owner-only user management under `/api/v1/users`, a read-only `/api/v1/audit`, `/health`, and the business API under `/api/v1/business`.

Business endpoints:

- `GET /business/snapshot` and `GET /business/{kind}` — role-filtered reads.
- `POST /business/{kind}` and `PATCH /business/{kind}/{id}` — validated create/update.
- `POST /business/{kind}/{id}/reverse` — reversal that preserves history (no DELETE route).
- `POST /business/inventory/{id}/movement` — server-derived stock delta.
- `POST /business/purchase/{id}/payment` — balance/status calculated on the server.

Staff may only update or reverse records they created; managers and owners may act on any record. A 404 is returned for another user's record so its existence is not disclosed. Authentication uses Argon2id hashes and server-managed HttpOnly cookies with double-submit CSRF tokens; there is no JWT and no credential in `localStorage` on the backend side. The SPA sends `credentials: 'include'` and copies only the CSRF cookie into a header.

See `SECURITY_ASSESSMENT.md` for the full audit, implementation record, test results, remaining gaps and deployment configuration. **This is not a production-ready system**; MFA, PostgreSQL, backup/restore, HTTPS deployment and independent assurance are still outstanding.

The visual identity is built with typography, colour and inline icons. Small PNG icons in `public/` are used only for PWA installation and device notifications.

---

**Version:** 1.0 · **Default currency:** KES · **Status:** Client review build + API-backed authentication/RBAC and server-enforced business records
