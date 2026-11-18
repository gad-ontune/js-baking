# Crumb & Co. — Bakery Business Suite

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

---

## Project structure

```text
src/
  components/       Reusable UI, app shell, report shell
  lib/              Seed data, analytics, formatting and persistence store
  pages/
    inventory/
    purchases/
    production/
    sales/
    reports/
    settings/
  App.jsx           Routes and permission guards
  main.jsx          App entry point
```

Data is persisted in `localStorage` under `crumb-co-bakery-v2`. All mutations flow through `src/lib/store.jsx`, which keeps the UI independent of the storage mechanism. That boundary is deliberately kept clean so the browser store can be replaced by FastAPI/PostgreSQL endpoints during the backend phase without rewriting the screens.

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

## Notes for the next implementation phase

This repository currently delivers the complete client-facing application with a browser-persisted data layer, which is ideal for review, acceptance and demonstration. The SRS production stack (React + FastAPI + PostgreSQL, JWT, Argon2/bcrypt, Pytest) maps directly onto the existing module boundaries:

- `src/lib/store.jsx` → REST client / API hooks
- `src/lib/seed.js` → database migrations and seed scripts
- Client-side role checks → server-side JWT authorization
- Browser audit log → database-backed audit tables

No image assets are required; the visual identity is built with typography, colour and inline icons.

---

**Version:** 1.0 · **Default currency:** KES · **Status:** Client review build
