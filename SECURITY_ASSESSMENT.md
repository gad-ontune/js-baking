# Security Assessment and Implementation Plan

**Date:** 2026-11-19  
**Project:** JS Baking House — Bakery Inventory & Business Management System  
**Target:** OWASP ASVS 5.0.0 Level 2, OWASP API Security Top 10  
**Scope:** Current repository as inspected before security implementation.

---

## 1. Architecture found

- Frontend: Vite + React 18 + React Router 6 + Tailwind + Recharts.
- Backend: **none**. No FastAPI, API routes, database driver, or server middleware exists.
- Database: **none**. All application state is persisted in browser `localStorage` under `js-baking-house-v3`.
- Authentication: client-side comparison of a username and plain-text password in `src/lib/store.jsx`.
- Authorization: static role map and client-side route guards only.
- Notifications: browser Notification API with a service worker added in the current working tree.
- Deployment: no HTTPS, headers, host configuration, CI, migrations, or backup configuration.

This is a client-review demo. It must not be treated as a production security boundary.

---

## 2. Status definitions

- **Implemented and verified** — code exists and automated tests or a reproducible check confirm it.
- **Implemented, not verified** — code exists but no automated security test has been run for it.
- **Partially implemented** — some protection exists but important parts are missing.
- **Not implemented** — no meaningful protection found.
- **Not applicable** — no component exists yet; must be designed into the backend phase.

---

## 3. Findings

### 3.1 Authentication — Not implemented for production

**Evidence**

- `src/lib/store.jsx:100-123` compares `candidate.password === password` in the browser.
- `src/lib/seed.js:66-97` stores demo passwords in plain text.
- `src/pages/Login.jsx:17-31` uses a 350 ms delay before the local check.
- No backend, MFA, reset token, lockout, failed-login audit, or unusual-login detection exists.

**Risk:** anyone with access to the app can inspect credentials or impersonate a user. No server-side control exists.

**Fix:** implement Argon2id hashing, server-managed sessions, rate-limited login, MFA for privileged roles, and generic error responses in a FastAPI backend.

### 3.2 Password storage — Not implemented

**Evidence**

- Plain-text passwords are part of the persisted state written to `localStorage` at `src/lib/store.jsx:43-49`.
- New passwords are stored directly by `src/pages/settings/Users.jsx:30-45`.

**Risk:** password disclosure through devtools, browser profile theft, or malicious scripts.

**Fix:** passwords must exist only as Argon2id hashes in PostgreSQL. Frontend must never receive a password hash.

### 3.3 Session management — Not implemented

**Evidence**

- `sessionUserId` is stored inside the same mutable object as business data (`src/lib/store.jsx:5,28,45`).
- No expiry, idle timeout, HttpOnly cookie, Secure flag, SameSite policy, session revocation, or CSRF token exists.
- Fresh seed data starts authenticated as owner (`src/lib/seed.js:98`).

**Fix:** server-managed sessions in HttpOnly/Secure/SameSite cookies, idle and absolute expiry, rotation on login, revocation on logout/password change, and CSRF protection for state-changing requests.

### 3.4 RBAC — Partially implemented, client-only

**Evidence**

- Roles and permissions are hard-coded in `src/lib/store.jsx:8-24`.
- `can()` at `src/lib/store.jsx:91-98` is client-side only.
- Guards exist in `src/App.jsx:30-41,64-103` and nav filtering in `src/components/Layout.jsx:154`.
- `mutate()` has no permission check and is available to every page.
- Staff has `purchases.view` but purchase screens expose create/void/payment actions.
- Role, password, active flag and `sessionUserId` are editable by any script running on the origin.

**Fix:** centralized backend authorization dependencies on every endpoint; enforce permissions for actions and individual records, deny by default, and guard high-risk operations with re-authentication.

### 3.5 XSS — Implemented and verified (frontend)

**Evidence**

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, or `javascript:` URLs in `src/`.
- Dynamic strings are rendered as React children.

**Risk:** future rich-text features or unsafe URL handling could regress this. A CSP is still missing.

**Fix:** keep React-safe rendering, add CSP and security headers, and sanitise any future rich text.

### 3.6 SQL injection — Not applicable yet

No SQL layer exists. The backend must use SQLAlchemy ORM/parameterised statements and allowlists for sorting/filtering.

### 3.7 CSRF — Not applicable yet

No cookie-authenticated state-changing API exists. It becomes mandatory once session cookies are introduced.

### 3.8 IDOR — Not applicable yet

No object-level API endpoints exist. Backend endpoints must verify ownership/tenant and permission for every record ID.

### 3.9 Audit logging — Partially implemented

**Evidence**

- `addAudit()` in `src/lib/store.jsx:72-84` records basic events.
- Login/logout are manually logged; most page handlers call `addAudit`.
- Logs are stored in the same mutable `localStorage` object.
- Failed logins, denied access and demo reset are not logged. Old/new values, IP, and request IDs are absent.
- `resetDemo()` at `src/lib/store.jsx:139-142` wipes all history.

**Fix:** append-only server-side audit table, server timestamps, request correlation IDs, IP/user agent, old/new values, restricted access, and hash chaining for security-critical events.

### 3.10 CSV formula injection — Vulnerable

**Evidence**

- `src/lib/format.js:148-152` only escapes `"` when generating CSV.
- `src/components/ReportShell.jsx:19` passes report rows directly to `downloadCSV`.
- Free-text product names, expense descriptions, supplier names and movement reasons reach exports.

**Risk:** a value beginning with `=`, `+`, `-`, or `@` can execute when an owner opens the CSV in Excel/LibreOffice.

**Fix:** prefix dangerous leading characters with an apostrophe; strip control characters.

### 3.11 Financial and numeric validation — Vulnerable

**Evidence**

- Modal footer buttons are outside form elements, so native `required`, `min`, `max`, `type=number` and `type=email` constraints do not fire.
- Manual checks such as `if (amount <= 0)` are false for `NaN`, so invalid values can be persisted and later become `null` in JSON.
- Examples: `src/pages/sales/Expenses.jsx:170`, `src/pages/production/Production.jsx:152`, `src/pages/settings/Configuration.jsx:162`, `src/pages/sales/Sales.jsx:70-71`.

**Fix:** central finite-number, date, and required-field validation; reject invalid input before any mutation.

### 3.12 Privilege management — Partially implemented

**Evidence**

- `src/pages/settings/Users.jsx` allows role/password/active edits with no re-authentication.
- No duplicate username validation and no last-owner protection.
- Self-demotion is not blocked.

**Fix:** backend-enforced privileged operation with last-owner invariant and re-authentication.

### 3.13 Security headers and CSP — Not implemented

**Evidence**

- No CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or frame-ancestors directives in `index.html`, `vite.config.js`, or deployment config.
- Third-party Google Fonts CSS is imported in `src/index.css:1`.

**Fix:** configure headers at the reverse proxy/static host; add a dev/preview header baseline; constrain CSP to self plus explicitly required font origins.

### 3.14 Service worker and PWA — Partially implemented

**Evidence**

- `src/main.jsx:11` registers `/sw.js` at root scope.
- `public/sw.js:12-26` uses `skipWaiting()` and `clients.claim()` and deletes every other cache on the origin.
- `public/sw.js:30-47` caches every successful same-origin GET indefinitely.
- `public/sw.js:50-63` trusts `event.notification.data.url` without same-origin validation.
- PWA files are untracked in the current working tree.

**Fix:** allowlist cacheable paths, enforce same-origin notification targets, remove aggressive cache deletion, and commit the PWA assets.

### 3.15 Dependency security — Action needed

`npm audit --omit=dev` result:

- 2 moderate advisories in `react-router` / `react-router-dom`.
- Open redirect via backslash in navigation targets (GHSA-wrjc-x8rr-h8h6).
- Arbitrary constructor injection in SSR hydration (GHSA-337j-9hxr-rhxg).
- Fix requires `react-router-dom` 7.18.6, a breaking major upgrade.

**Fix:** schedule a tested major upgrade; add `npm audit` to CI; do not silently accept advisories.

### 3.16 HTTPS and deployment — Not implemented

- `vite.config.js:6-9` binds the dev server to all interfaces over HTTP.
- No production TLS termination, HTTP→HTTPS redirect, SPA history fallback, cache-control policy, or host hardening exists.

### 3.17 Backups and recovery — Not implemented

No backup job, encrypted off-server storage, retention policy, integrity check, or restoration test exists. Browser-local data cannot satisfy the backup requirements.

---

## 4. Prioritised implementation plan

### Phase 1 — Frontend hardening (no backend required)

| Severity | Issue | Files | Fix | Tests |
|---|---|---|---|---|
| Medium | CSV formula injection | `src/lib/format.js`, `src/components/ReportShell.jsx` | Neutralise leading formula characters and control characters | Node/unit test for `downloadCSV` escaping helper |
| Medium | `NaN`/invalid financial input | `src/lib/format.js`, sales/purchases/expense/production/config pages | Shared `isFiniteNumber` and `validDate` helpers; explicit checks | Unit tests for validation helpers |
| Medium | Unvalidated notification navigation | `src/lib/notificationCenter.jsx`, `Layout.jsx`, `Notifications.jsx`, `public/sw.js` | Allow only same-origin absolute URLs or root-relative paths | Unit test for URL validator |
| Medium | Service worker over-caching | `public/sw.js` | Cache allowlist, versioned caches, no cross-app cache deletion | Manual SW smoke test |
| Medium | Missing headers | `vite.config.js`, `index.html`, deployment docs | Baseline security headers/CSP | Build + header check |
| Medium | Credential/session bootstrap | `src/lib/seed.js`, `src/lib/store.jsx`, `src/pages/Login.jsx` | Start logged out, minimum password policy, failed-login audit, duplicate username check | Unit tests for policy helpers |
| Medium | Dependency advisory | `package.json`, CI | Add audit script; plan tested React Router v7 upgrade | `npm audit` |

### Phase 2 — Backend security foundation

1. FastAPI application with explicit CORS allowlist, request-size limits, security headers, structured errors.
2. SQLAlchemy models: users, sessions, audit logs, and core business entities.
3. Argon2id password hashing with benchmarked parameters from environment configuration.
4. Server-managed sessions in HttpOnly/Secure/SameSite cookies; rotation, idle timeout, absolute expiry, revocation.
5. Login rate limiting and progressive delays; generic error messages.
6. Pydantic request schemas that reject unknown fields.
7. Reusable RBAC dependencies with owner/manager/staff roles and deny-by-default.
8. Audit service with append-only records and request metadata.
9. Tests: password hashing, unauthenticated access, role escalation, rate limiting, CSRF, session expiry/revocation, validation.

### Phase 3 — Business integrity

- Transactional purchase, sale, expense, and stock-adjustment services.
- Backend-calculated financial totals, COGS, and profit.
- Reversal workflows instead of hard deletion.
- Object-level authorization for every record ID.
- Movement history with previous/new quantities and actor.
- Tests for IDOR, negative stock, unauthorised reversals, and financial tampering.

### Phase 4 — Deployment and assurance

- PostgreSQL hardening, migrations, least-privilege database role, encrypted connections.
- HTTPS/HSTS at the edge; secure cookie configuration.
- Encrypted daily backups with 14/8/12 retention and documented restore test.
- CI: lint, unit tests, `npm audit`, `pip-audit`, Bandit, Gitleaks.
- Manual security review against ASVS Level 2 before production release.

---

## 5. Controls not yet implemented

MFA, password reset, TOTP recovery codes, server-side session revocation, CSRF tokens, object-level authorization, PostgreSQL persistence, encrypted backups, production security headers, WAF, and independent penetration testing are all **not implemented** at assessment time.

No production compliance claim is made.

---

## 6. Implementation progress — Phase 1

**Status:** implemented and verified locally.

| Control | Status | Location / result |
|---|---|---|
| CSV formula injection neutralised | Implemented and verified | `src/lib/format.js` (`csvCell`), `tests/security.test.js`; 7/7 tests pass |
| Numeric/date/email validation helpers | Implemented and verified | `src/lib/security.js`, `tests/security.test.js`; applied to sales, purchases, expenses, production, inventory and settings forms |
| Password policy (12 characters) | Implemented and verified | `src/lib/security.js`, `tests/security.test.js`; enforced in user create/edit |
| Duplicate usernames | Implemented | `src/pages/settings/Users.jsx` |
| Last-owner and self-demotion protection | Implemented | `src/pages/settings/Users.jsx` |
| Stale demo session expiry and active-user check | Implemented | `src/lib/store.jsx`, `src/lib/seed.js` |
| Demo login starts logged out | Implemented | `src/lib/seed.js` |
| Login throttling/progressive delay | Implemented, client-side only | `src/pages/Login.jsx` |
| Failed-login and demo-reset audit events | Implemented | `src/lib/store.jsx` |
| Expense/production reversal instead of deletion | Implemented | `src/pages/sales/Expenses.jsx`, `src/pages/production/Production.jsx`, `src/lib/analytics.js` |
| Notification navigation allowlist | Implemented and verified | `src/lib/security.js`, `notificationCenter.jsx`, `Layout.jsx`, `Notifications.jsx`, `deviceNotifications.js`; tests pass |
| Service worker cache allowlist and same-origin notification target | Implemented | `public/sw.js` |
| CSP and baseline security headers | Implemented for dev/preview | `vite.config.js`, `index.html`; production host must also enforce them |
| Expanded secret ignore patterns | Implemented | `.gitignore` |
| Dependency audit script | Implemented | `package.json`; `npm run audit:npm` passes at high threshold, 2 moderate React Router advisories remain |

**Verification executed**

- `npm test` — 7/7 passing.
- `npm run lint` — passing.
- `npm run build` — passing.
- `npm run audit:npm` — passes at `--audit-level=high`; 2 moderate advisories remain and require a tested React Router v7 upgrade.

**Remaining Phase 1 risk:** these are browser-side improvements. They reduce accidental misuse and common client attacks, but they do not create a security boundary. A user with devtools access can still alter local state. Backend enforcement remains mandatory.
