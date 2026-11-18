# JS Baking House — Business Suite

A polished, responsive internal management application for a cake bakery and juice business. It brings inventory, purchasing, suppliers, production, sales, expenses, reports and settings into one calm workspace.

The application is built around the supplied Software Requirements Specification and includes realistic seeded data so the client can immediately explore every workflow.

---

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

### Demo accounts

| Role | Username | Password | Access |
|---|---|---|---|
| Owner / Administrator | `amina` | `owner123` | Full access to every module |
| Staff | `brian` | `staff123` | Operational modules only; no settings or user management |

The sign-in screen has one-click demo account buttons.

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
  lib/              Seed data, analytics, formatting, notifications and persistence store
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

Data is persisted in `localStorage` under `js-baking-house-v3`. All mutations flow through `src/lib/store.jsx`, which keeps the UI independent of the storage mechanism. That boundary is deliberately kept clean so the browser store can be replaced by FastAPI/PostgreSQL endpoints during the backend phase without rewriting the screens.

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

## Backend security API (Phase 2)

A FastAPI security foundation now exists under `backend/`. It is **not yet connected to the React UI** — the SPA remains the browser-persisted client review build.

```bash
# Install backend dependencies (dev + tests + scanners)
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt

# Run the API locally
ENVIRONMENT=development backend/.venv/bin/python -m uvicorn backend.app.main:app --reload

# Create the first owner (credentials come only from the environment)
cp backend/.env.example backend/.env      # then edit it, never commit it
SEED_OWNER_USERNAME=... SEED_OWNER_PASSWORD=... \
  backend/.venv/bin/python backend/scripts/create_owner.py

# Verify
npm run verify:backend
```

The API exposes `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/change-password`, `GET /api/v1/auth/me`, owner-only user management under `/api/v1/users`, a read-only `/api/v1/audit`, and `/health`. Authentication uses Argon2id hashes and server-managed HttpOnly cookies with double-submit CSRF tokens; there is no JWT and no credential in `localStorage` on the backend side.

See `SECURITY_ASSESSMENT.md` for the full audit, implementation record, test results, remaining gaps and deployment configuration. **This is not a production-ready system**; MFA, PostgreSQL, backup/restore, business-record authorization and SPA integration are still outstanding.

The visual identity is built with typography, colour and inline icons. Small PNG icons in `public/` are used only for PWA installation and device notifications.

---

**Version:** 1.0 · **Default currency:** KES · **Status:** Client review build + backend security foundation
