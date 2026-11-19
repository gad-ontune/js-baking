# Security Assessment and Implementation Plan

**Date:** 2026-11-19  
**Project:** JS Baking House — Bakery Inventory & Business Management System  
**Target:** OWASP ASVS 5.0.0 Level 2, OWASP API Security Top 10  
**Scope:** Current repository as inspected before security implementation.

Sections 1–5 record the original assessment; sections 6–10 record the phased
remediation in chronological order. **Section 11 is the current status** and
supersedes the "not implemented" statements in the earlier sections.

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

At assessment time, MFA, password reset, TOTP recovery codes, server-side session
revocation, CSRF tokens, object-level authorization, PostgreSQL persistence,
encrypted backups, production security headers, WAF and independent penetration
testing were all **not implemented**. Most of these have since been implemented;
see section 11 for the authoritative current status.

No production compliance claim is made. This section records the initial
assessment; implementation progress follows in sections 6–11.

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

---

## 7. Implementation progress — Phase 2 (backend foundation)

**Status:** implemented and verified. The React SPA was initially not connected; Phase 3 (section 9) completed that integration.

| Control | Implementation location and configuration | Automated test | Result |
|---|---|---|---|
| Argon2id password hashing | `backend/app/security.py`; `ARGON2_TIME_COST=2`, `ARGON2_MEMORY_COST_KIB=19456`, `ARGON2_PARALLELISM=1`; 32-byte hash, 16-byte salt | `test_password_hashing_uses_argon2id_and_verifies`, `test_stored_password_is_never_plaintext` | Pass |
| Password policy and compromised-password rejection | `backend/app/security.py`, `backend/app/schemas.py`; min 12, max 1024, no padding, small common-password deny-list | `test_password_policy_rejects_short_common_and_padded_values`, `test_weak_password_is_rejected_on_create` | Pass |
| Server-managed sessions | `backend/app/auth.py`; random token hashed with SHA-256 at rest, HttpOnly + SameSite cookie, `COOKIE_SECURE` for HTTPS, 12 h absolute / 30 min idle, rotation on login and password change | `test_login_sets_httponly_cookie_and_returns_no_hash`, `test_expired_session_is_rejected`, `test_idle_session_is_rejected`, `test_password_change_rotates_session_and_audits` | Pass |
| Session revocation | Logout, user deactivation, role change, explicit owner revoke-all | `test_logout_revokes_session`, `test_deactivation_revokes_all_target_sessions`, `test_role_change_revokes_all_target_sessions`, `test_owner_can_revoke_suspicious_sessions` | Pass |
| CSRF and origin validation | `backend/app/auth.py`; double-submit token plus explicit `Origin` allowlist on all state-changing routes | `test_state_changes_require_csrf_and_trusted_origin` | Pass |
| Backend RBAC, deny by default | `backend/app/auth.py` (`ROLE_PERMISSIONS`, `require_permissions`); owner-only user and audit endpoints | `test_protected_endpoints_require_authentication`, `test_staff_cannot_manage_users_or_read_audit`, `test_staff_cannot_promote_self` | Pass |
| Mass-assignment protection | `backend/app/schemas.py` uses `extra='forbid'`; role/status are never read from a create payload | `test_user_creation_rejects_privilege_fields` | Pass |
| Last-owner and self-demotion protection | `backend/app/routers/users.py`; only active owners count toward the invariant | `test_last_owner_cannot_demote_or_deactivate_self`, `test_inactive_owner_can_be_demoted_without_tripping_last_owner_guard`, `test_self_demotion_is_blocked` | Pass |
| Generic authentication errors | `backend/app/routers/auth.py` returns the same 401 for unknown user, wrong password and disabled account | `test_failed_login_is_generic_and_audited`, `test_inactive_user_cannot_log_in` | Pass |
| Login rate limiting | `backend/app/ratelimit.py`; 5 failures per username per 15 min plus a per-IP ceiling | `test_login_rate_limit_returns_429` | Pass |
| SQL injection resistance | SQLAlchemy ORM only; no string-built SQL | `test_sql_injection_payload_does_not_authenticate` | Pass |
| Append-only audit logging | `backend/app/audit.py`, `backend/app/models.py` (`AuditLog`), `backend/app/routers/audit.py`; request IP, user agent, request ID, old/new values, no update/delete routes | `test_failed_login_is_generic_and_audited`, `test_audit_log_is_owner_only_and_read_only`, `test_audit_records_never_contain_passwords` | Pass |
| CORS restriction | `backend/app/main.py`; explicit `CORS_ORIGINS` allowlist with credentials enabled only for those origins | `test_cors_does_not_allow_arbitrary_origins` | Pass |
| API hardening | `backend/app/main.py`: 1 MiB body limit, no-store on API, CSP/nosniff/frame/referrer/permission headers, HSTS in production, generic 500 handler, validation errors without submitted values, docs disabled in production | `test_oversized_request_body_is_rejected`, `test_security_headers_are_present`, `test_validation_errors_do_not_echo_secrets`, `test_production_configuration_disables_api_docs` | Pass |
| Secret-free bootstrap | `backend/scripts/create_owner.py`; owner credentials read only from `SEED_OWNER_*` environment variables, never printed | Manual review + `backend/.env.example` | Verified by review |
| Dependency currency | `backend/requirements.txt`; FastAPI 0.165.0 / Starlette 1.10.0 after remediating advisories found in 0.115.6 / 0.41.3 | `npm run audit:pip` | No known vulnerabilities |

**Verification executed**

- `npm run test:backend` — **34 passed** (`backend/tests/test_security.py`).
- `npm run audit:pip` — **No known vulnerabilities found**.
- `npm run scan:bandit` — clean, no findings.
- Live `uvicorn` smoke test — `/health` returned `200 {"status":"ok"}` and startup completed without errors.
- `npm run verify:backend` — passes the full chain above.

**Note on test isolation:** `backend/tests/conftest.py` points `DATABASE_URL` at a temporary SQLite file before app import, drops/recreates tables per test, and clears limiter state. No production or business data is used.

---

## 8. Final security report

### 8.1 Features implemented and verified

Authentication (Argon2id, generic errors, rate limiting, active-user checks), server-managed sessions with idle/absolute expiry and revocation, CSRF plus origin validation, backend RBAC with deny-by-default, strict request schemas, append-only audit records, CORS allowlist, security headers, body-size limits, safe error handling, owner bootstrap without committed secrets, frontend hygiene from Phase 1, API-backed authentication, RBAC, user management, password change and audit viewing in the SPA (Phase 3), and server-enforced business records with strict edge validation, server-computed stock/totals, object-level authorization and reversal-only cancellation (Phase 4). Email verification, owner-controlled recovery, MFA, Redis rate limiting, audit hash chaining, PostgreSQL/Alembic, CI and the Docker Compose deployment were added afterwards and are documented in section 11.

### 8.2 Files created or modified

- Backend: `backend/__init__.py`, `backend/app/{__init__,config,database,models,security,ratelimit,audit,auth,business,schemas,main}.py`, `backend/app/routers/{__init__,auth,users,audit,business}.py`, `backend/scripts/{create_owner,seed_demo,seed_business}.py`, `backend/pytest.ini`, `backend/tests/{conftest,test_security,test_demo_seed,test_business,test_business_seed}.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/.env.example`.
- Frontend / repo: `src/lib/{api,permissions,demoCredentials}.js`, `src/lib/store.jsx`, `src/pages/Login.jsx`, `src/App.jsx`, `src/pages/settings/{Users,Audit}.jsx`, `src/lib/seed.js`, `vite.config.js`, `tests/{api,demoAccounts}.test.js`, business pages under `src/pages/{inventory,purchases,production,sales}`, `README.md`, `SECURITY_ASSESSMENT.md`, `package.json`, `.gitignore`, plus the Phase 1 files listed in section 6.

### 8.3 Security libraries introduced

`fastapi==0.165.0`, `starlette==1.10.0` (transitive), `uvicorn[standard]==0.54.0`, `SQLAlchemy==2.0.36`, `argon2-cffi==23.1.0`, `pydantic==2.10.4`, `pydantic-settings==2.7.0`. Test/scanning: `pytest==8.3.4`, `httpx==0.28.1`, `pip-audit==2.10.1`, `bandit==1.9.4`.

### 8.4 Tests created and executed

- `tests/security.test.js` — 7 frontend security tests (CSV injection, validation, password policy, navigation allowlist).
- `tests/api.test.js` — 10 frontend API-client tests covering credential inclusion, CSRF header handling, network-error safety, route construction, secret-free errors, record mapping, RBAC mirror checks and the server-authoritative business routes/CSRF behaviour.
- `tests/demoAccounts.test.js` — 2 consistency tests ensuring the one-click demo credentials match the backend seeder and that no plaintext passwords remain in `src/lib/seed.js`.
- `backend/tests/test_security.py` — 34 backend security tests covering authentication, password security, sessions, RBAC, privilege escalation, IDOR-style user ID manipulation, brute-force protection, SQL injection, CSRF, origin validation, mass assignment, audit integrity, headers, body limits, error leakage and production configuration.
- `backend/tests/test_demo_seed.py` — 3 tests covering demo password policy, production refusal and idempotent seeding.
- `backend/tests/test_business.py` — 16 business API tests covering role-filtered snapshots, strict schema validation, object-level ownership (staff cannot act on another user's records), server-computed stock/totals, negative-stock rejection, reversal-only cancellation, supplier payments and audit events.
- `backend/tests/test_business_seed.py` — 1 test confirming the demo business seeder produces consistent, non-negative inventory and valid sales.
- Total at the end of Phase 4: **73 automated tests** (19 frontend + 54 backend), all passing.
- MFA, recovery, Redis and audit-chain tests were added later; current totals and commands are in section 11. Backup restoration is still a manual step.

### 8.5 Vulnerabilities resolved

Plaintext backend credential storage; client-only authentication; client-only authorization; absent CSRF protection; absent login throttling; mutable client-side audit trail; CSV formula injection; open-redirect-like notification navigation; over-broad service worker caching; missing API security headers; submission of unvalidated numeric/date values; hard deletion of expense and production records in the demo; browser-authoritative business data (totals, stock, references and reversal state); and the Starlette advisories found by `pip-audit`.

### 8.6 Remaining vulnerabilities and explicit gaps

Status at the end of Phase 4 (superseded by section 11):

| Gap | Status at Phase 4 | Current status |
|---|---|---|
| SPA authentication, RBAC, users, audit and business records are API-backed | Implemented and verified (Phases 3–4) | Unchanged. `localStorage` is only an offline fallback for unauthenticated demo browsing; authenticated writes go through the API and re-hydrate from the server snapshot. |
| MFA/TOTP, recovery codes | Not implemented | **Implemented and verified (section 11).** |
| Password reset workflow | Not implemented | **Implemented and verified (section 11).** Owner-controlled, with single-use tokens and session revocation. |
| PostgreSQL, migrations | Not implemented | **Implemented and verified (section 11).** Alembic owns the schema; SQLite remains the local development default. |
| Least-privilege DB role, connection encryption | Not implemented | **Partial.** Stack uses a dedicated DB account on an internal network; TLS/role review is still a manual deployment task. |
| Encrypted backups, off-server storage, restore drill | Not implemented | **Still open.** No RPO/RTO can be demonstrated. |
| Object-level authorization and transactional integrity for business records | Implemented and verified (Phase 4) | Unchanged. See section 10. |
| Shared rate limiter for multi-worker deployments | Partially implemented (in-memory, per process) | **Implemented and verified (section 11).** Redis-backed and fail-closed when unavailable. |
| HTTPS/TLS termination and trusted-proxy configuration | Not implemented | **Partial.** nginx sends HSTS and overwrites `X-Forwarded-For` with the direct peer; real TLS/WAF termination is deployment-specific and still open. |
| Audit hash chaining, anomaly alerting, WAF | Not implemented | **Partially implemented (section 11).** Hash chain verified; anomaly alerting and WAF remain open. |
| 2 moderate React Router advisories | Open, documented | **Resolved.** Upgraded to `react-router-dom@7.18.6`; `npm audit` reports 0 vulnerabilities. |
| Argon2 work-factor benchmarking | Pending manual step | **Still pending.** Parameters are conservative defaults, not calibrated on target hardware. |
| Gitleaks and Semgrep scans | Not executed | **CI gates added (section 11)** on every push and pull request. |
| Independent ASVS Level 2 review and penetration testing | Not executed | **Still open.** Required before production release. |

**No production-ready or compliant claim is made.** The application is production-*conscious*, not production-*ready*.

### 8.7 Configuration required for deployment

The deployment is now defined in `docker-compose.yml` with `.env.example`; the
steps below describe that stack. See section 11 and `README.md` for commands.

1. Copy `.env.example` to `.env`; set `POSTGRES_PASSWORD`, `REDIS_PASSWORD` (URL-safe characters), `CORS_ORIGINS`/`FRONTEND_URL` to the exact public HTTPS origin, `ENVIRONMENT=production`, `COOKIE_SECURE=true` and a suitable `COOKIE_SAMESITE`.
2. Set `SMTP_HOST`, `SMTP_FROM` and credentials if required, or owner recovery and email verification fail closed in production. Set `MFA_ENCRYPTION_KEY` (32 random bytes, URL-safe base64) or MFA setup returns 503.
3. Benchmark and set Argon2 parameters for the deployment hardware; tune session lifetimes to policy.
4. Bootstrap the first owner once with `SEED_OWNER_*` in the environment (the backend entrypoint calls `create_owner.py`), using a secret manager. Never commit `.env`.
5. Terminate HTTPS at a trusted edge in front of nginx, redirect HTTP, and confirm that proxy does not strip the security headers or overwrite HSTS. nginx already overwrites `X-Forwarded-For` with the direct peer and does not publish PostgreSQL or Redis to the host.
6. Review the dedicated database role so the API account cannot `UPDATE`/`DELETE` `audit_logs`, and keep database access private.
7. Configure encrypted daily backups of the `pgdata` volume with 14-day/8-week/12-month retention and complete a documented restore test.
8. Run `npm run verify`, `npm run verify:backend`, `alembic upgrade head && alembic check`, Docker Compose config validation, Gitleaks and Semgrep in CI before each release (all are configured in `.github/workflows/ci.yml`).

### 8.8 Controls requiring manual verification

- Real-browser cookie flags (`Secure`, `HttpOnly`, `SameSite`) over HTTPS.
- Reverse-proxy header behaviour and HSTS preload readiness.
- Database role privileges and audit-table immutability.
- Backup restoration and recovery-time measurement.
- Argon2 calibration and login latency under expected load.
- TLS/WAF configuration and trusted-proxy setup in a real environment.
- Full OWASP ASVS 5.0.0 Level 2 review and authorised penetration testing.

The following were manual items at Phase 4 but have since been smoke-tested:
Redis-backed rate limiting with multiple workers, MFA challenge login, and
owner-issued password reset (section 11). Backup/restore remains manual.

---

## 9. Implementation progress — Phase 3 (SPA ↔ API integration)

**Status:** implemented and verified locally. This closes the highest-priority gap from Phase 2.

| Control | Implementation | Verification |
|---|---|---|
| Session restore and auth state | `src/lib/store.jsx` calls `GET /auth/me` on startup, exposes `authStatus`, and shows a loading gate in `src/App.jsx` and `src/pages/Login.jsx`. A five-minute heartbeat refreshes the backend idle window and detects remote logout or role change. | Live login → `/me` → logout flow; route guard behaviour |
| API-backed sign-in and sign-out | `signIn`/`signOut` call `/auth/login` and `/auth/logout`. No password is compared or stored in the browser. | `tests/api.test.js`, live proxy smoke test |
| CSRF-safe client | `src/lib/api.js` uses `credentials: 'include'` and copies only the `jsbh_csrf` cookie into `X-CSRF-Token` on state-changing requests; it never reads the session cookie. | `tests/api.test.js` (4 CSRF/credential tests) |
| Backend-derived roles in route guards | `src/lib/permissions.js` mirrors `backend/app/auth.py`. Settings → Users and Audit now require `users.manage` and `audit.view`, which only the backend grants to owners. | `tests/api.test.js` permission tests |
| Authoritative user directory | Users page reads and mutates accounts only through `/users`. The backend-created users are merged into local demo records for historical name lookup. | `src/pages/settings/Users.jsx`; API smoke test listed 3 seeded roles |
| Own password change | `/auth/change-password` exposed through the Users page; the response rotates the session and CSRF token. | Backend `test_password_change_rotates_session_and_audits` |
| Server-side audit view | Audit page reads `/audit` only; no client-side mutation is possible. | `src/pages/settings/Audit.jsx`; live audit fetch returned `LOGIN_SUCCESS` |
| No plaintext demo passwords in SPA | Removed the three passwords from `src/lib/seed.js`; `backend/scripts/seed_demo.py` creates long dev-only accounts. The seeder refuses to run in production unless explicitly overridden. | `tests/demoAccounts.test.js`, `backend/tests/test_demo_seed.py` |
| Local development proxy | `vite.config.js` forwards `/api` to the backend (default `http://127.0.0.1:8000`, configurable with `VITE_API_TARGET`) so cookies stay same-origin. | Live Vite + uvicorn smoke test through port 5175 → 8011 |

**Verification executed**

- `npm test` — **19 passed** (7 original + 10 API-client + 2 demo-account consistency; the extra API test asserts the business routes and CSRF behaviour from Phase 4).
- `npm run test:backend` — **54 passed** at this phase (34 security + 3 demo-seed + 16 business + 1 business-seed).
- `npm run lint` and `npm run build` — pass.
- Live end-to-end smoke test through the Vite proxy: owner login returned the backend user and CSRF token; `/auth/me`, `/users` and `/audit` succeeded with the session cookie; logout without a CSRF header returned **403**, with the header **204**, and `/auth/me` then returned **401**.
- Standalone script checks: owner bootstrap, demo seeding, and production refusal (exit 2) all behaved as documented.

**Scope boundary:** at this phase business data (inventory, purchases, production, sales, expenses) was still stored in `localStorage`. Phase 4 (section 10) subsequently moved those collections behind the business API, so this boundary no longer applies.

---

## 10. Implementation progress — Phase 4 (server-enforced business records)

**Status:** implemented and verified locally. This closes the business-data gap recorded in sections 8.6 and 9.

### 10.1 Design

Business records use a single `BusinessRecord` JSON table with a `kind` discriminator (`inventory`, `movement`, `supplier`, `product`, `purchase`, `sale`, `expense`, `production`). Strict Pydantic schemas at the API edge reject unknown fields and validate types, ranges and dates before a typed service layer applies domain rules. There are **no DELETE endpoints**: cancellations are reversals that preserve the original record and its audit trail.

The SPA hydrates all collections from `GET /business/snapshot` and performs every write through the business API; it no longer computes totals, stock levels, references, creator fields or reversal state. Those values are derived on the server and returned in the response. `localStorage` remains only an offline fallback for unauthenticated demo browsing.

### 10.2 Controls implemented

| Control | Implementation | Verification |
|---|---|---|
| Strict input validation and mass-assignment rejection | `backend/app/schemas.py`: `extra='forbid'`, length/range limits, date validators, nullable `productId` for writable product entry, expanded update DTOs. Client-supplied `total`, `paidAmount` and `quantity` fields on protected routes are rejected with 422. | `test_business_records_are_persisted_as_typed_json`, `test_inventory_update_cannot_change_quantity_directly`, `test_purchase_uses_server_computed_totals_and_updates_stock`, `test_sale_decreases_stock_and_creates_new_products_server_side` |
| Authentication and role-filtered reads | Business endpoints require a session; `GET /business/snapshot` and `GET /business/{kind}` apply `ROLE_PERMISSIONS`; staff cannot read suppliers or purchases. | `test_business_endpoints_require_authentication`, `test_snapshot_only_returns_collections_the_role_can_view`, `test_staff_cannot_create_suppliers_or_purchases`, `test_staff_can_manage_sales_and_expenses_but_not_settings` |
| Object-level authorization | Staff may only update/reverse records they created; managers/owners may act on any record. A 404 is returned for another user's record so its existence is not disclosed. | `test_staff_cannot_update_or_reverse_another_users_record`, `test_manager_can_operate_on_any_staff_record` |
| Server-computed financial totals | Purchase totals, sale subtotal/total/COGS, supplier balances and payment status are calculated server-side from validated line items; client-supplied totals are not accepted. | `test_purchase_uses_server_computed_totals_and_updates_stock`, `test_sale_decreases_stock_and_creates_new_products_server_side`, `test_payment_updates_balance_and_is_limited_to_outstanding_amount` |
| Server-derived stock movements | Movement type determines the delta: Purchase `+qty`, Adjustment sets the target `qty`, other types `-qty`. Purchases and sales create their movements in the same transaction. | `test_inventory_movements_apply_server_computed_stock_changes`, `test_purchase_uses_server_computed_totals_and_updates_stock`, `test_sale_decreases_stock_and_creates_new_products_server_side` |
| Negative stock prevention | A movement or sale that would drive stock below zero is rejected with 409 before any write; all lines are validated before movements are applied. | `test_inventory_movements_apply_server_computed_stock_changes`, `test_sale_cannot_oversell_tracked_stock` |
| Writable product catalogue | A sale may reference an existing product by id/name or introduce a new product name; the server creates the catalogue record (with an explicit `db.flush()` before stock lookups, because the session uses `autoflush=False`). | `test_sale_decreases_stock_and_creates_new_products_server_side` |
| Reversal instead of deletion | Sales, purchases, expenses and production are voided via `/reverse`, which records the actor, reason and timestamp and restores stock/balances. No DELETE route is registered (DELETE returns 405). | `test_purchase_reversal_reverses_stock_and_preserves_history`, `test_sale_decreases_stock_and_creates_new_products_server_side`, `test_staff_cannot_update_or_reverse_another_users_record` |
| CSRF on business writes | Every state-changing business request requires the double-submit CSRF token. | `test_csrf_required_for_business_writes` |
| Append-only audit coverage | Business creates, movements and other actions append server-side audit events with request metadata. | `test_business_actions_write_append_only_audit_records` |
| Demo business seeder | `backend/scripts/seed_business.py` generates a consistent demo dataset through the same service layer as the API; idempotent and production-guarded. | `backend/tests/test_business_seed.py`; live seeding produced 18 inventory, 5 suppliers, 8 products, 10 purchases, 40 sales, 18 expenses, 15 production and 101 movements |

### 10.3 Verification executed

- `npm run verify` — **19 frontend tests**, lint, build and `npm audit --audit-level=high` pass (2 moderate React Router advisories remain documented).
- `npm run verify:backend` — **54 backend tests**, `pip-audit` and Bandit pass.
- Live HTTP smoke test against `uvicorn` with seeded data:
  - Owner snapshot returned all eight collections with expected counts.
  - A stock movement without a CSRF header returned **403**; with the header it moved Flour `151 → 156` and logged `STOCK_MOVEMENT`.
  - A sale with a custom product created the product server-side, computed `total=6700`/`cost=260`, reduced tracked stock, and reversal returned `voided: true` with stock restored; audit showed `SALE_RECORDED`, `PRODUCT_CREATED` and `SALE_VOIDED`.
  - Staff snapshot returned **0** suppliers and **0** purchases; staff `GET`/`POST /business/purchase` both returned **403**.
  - Vite proxy smoke test: `/api/v1/business/snapshot` and the SPA root both returned **200**.

### 10.4 Residual risk

Backend business enforcement is now in place. The deployment and assurance
controls listed in sections 8.6–8.8 were still open at this phase; section 11
records which of them have since been implemented and smoke-tested
(PostgreSQL/Alembic, Redis, MFA, recovery, CI and Docker Compose) and which
remain open (backups/restore, TLS/WAF, Argon2 benchmarking and independent
ASVS review). **No production-ready or compliant claim is made.**

---

## 11. Current status — recovery, MFA and deployment assurance

**Status:** implemented and verified locally and in a fresh Docker Compose
stack. This is the authoritative status section and supersedes the stale
"not implemented" statements in sections 5, 8.6 and 10.4.

### 11.1 Controls added after Phase 4

| Control | Implementation | Verification |
|---|---|---|
| Real email delivery and verification | `backend/app/email_service.py` and `backend/app/routers/auth.py`: SMTP (configurable host/port/TLS/credentials) sends single-use verification and recovery codes; `FRONTEND_URL` builds links. Production fails closed with 503 if SMTP is unconfigured. | `test_recovery.py`; live demo issued codes (email delivery disabled in the demo overlay) |
| Owner-controlled password recovery | `POST /auth/forgot-password` verifies username **and** registered email and returns a generic response; `POST /auth/reset-password` exchanges a single-use, expiring token, enforces the password policy and revokes all sessions. Passwords are never displayed — Argon2id hashes only. | `test_recovery.py` (7 tests) |
| Staff reset tokens | `POST /users/{id}/reset-token` is owner-only and issues a one-time code for a staff/manager account. Development may display it once in the UI (`dev_token`); production hides it unless `JSBH_SHOW_DEV_TOKENS=true`. | `test_recovery.py`; live stack issued and redeemed a code for `brian` |
| Email verification | `POST /auth/email/verification-code` / `POST /auth/email/verify` use single-use codes; verification state is recorded on the user. | `test_recovery.py` |
| MFA / TOTP | `backend/app/mfa.py` and `/auth/mfa/*`: authenticator secret encrypted with a server-side Fernet key (`MFA_ENCRYPTION_KEY`), ten hashed single-use recovery codes, short-lived login challenge before a session is created (no session is issued before the second factor). Setup returns 503 in production without the key. | `test_mfa.py` (5 tests); live setup → enable → challenge → complete flow |
| Shared rate limiting | `backend/app/ratelimit.py`: Redis-backed limiter when `REDIS_URL` is set, otherwise in-memory for local development; fails closed with 503 if configured Redis is unavailable. nginx overwrites `X-Forwarded-For` with the direct peer. | `test_ratelimit.py` (3 tests); live stack returned 401 ×5 then 429 on the sixth failed login |
| Tamper-evident audit chain | `backend/app/audit.py`: append-only records include `previous_hash` and `record_hash`; `GET /audit/verify` (owner) and `backend/scripts/verify_audit_chain.py` recompute the chain. | `test_audit_chain.py` (3 tests); live chain `{"valid":true,"checked":126}` |
| PostgreSQL with Alembic | `AUTO_CREATE_SCHEMA=false` in deployments; entrypoint runs `alembic upgrade head` before any worker starts. Initial schema + revisions in `backend/migrations/versions/`. SQLite remains the development default. | `alembic upgrade head && alembic check` clean on SQLite and on the PostgreSQL stack |
| Prefixed ID width fix | Revision `22c4d8441b51` widens all prefixed ID/foreign-key columns (users, sessions, business records, audit, tokens, recovery codes) from `VARCHAR(36)` to `String(64)`; SQLite silently accepted the too-short values while PostgreSQL rejected them. | `test_config.py::test_id_columns_fit_prefixed_identifiers_on_strict_databases`; fresh PostgreSQL seed produced 126 audit records and the full business snapshot |
| Dependency currency | Upgraded to `react-router-dom@7.18.6` (routes migrated to React Router v7) and current FastAPI/Starlette; no known npm or pip advisories. | `npm audit` 0 vulnerabilities; `pip-audit` clean |
| CI gates | `.github/workflows/ci.yml` runs frontend tests/lint/build/npm audit, backend tests/pip-audit/Bandit, Alembic `upgrade head && check`, all Compose config variants, Gitleaks (`.gitleaks.toml`), Semgrep (`.semgrep.yml`) and a `compose-smoke` job that starts the stack, verifies DB hardening and runs the 32-check security smoke script. | Workflow pushed to `main` |
| Docker Compose deployment | `deploy/backend.Dockerfile` (non-root UID 10001, `PYTHONPATH=/app`), `deploy/frontend.Dockerfile` (unprivileged nginx), templated `deploy/nginx.conf.template` / `server-locations.conf.template` / `nginx-headers.conf.template` rendered by `web-entrypoint.sh` (same-origin `/api` proxy, WAF filters, CSP/COOP/CORP), `docker-compose.yml` (PostgreSQL + Redis + backup service on internal networks, health checks), `docker-compose.demo.yml` for local demo. | Full stack built from fresh volumes; all containers healthy; 32-check security smoke below |
| Least-privilege database access | `provision_database.py`, `grant_runtime_permissions.py`, `verify_database_hardening.py`: bootstrap role only creates `jsbh_owner`/`jsbh_app`; Alembic runs as owner; API runtime cannot create schema objects or update/delete audit rows. All DSNs use `sslmode=require`; PostgreSQL generates an internal TLS certificate on first volume init. Append-only trigger rejects every audit mutation. | `verify_database_hardening.py` passed all checks; `show ssl` = `on`; direct `UPDATE audit_logs` failed with `audit_logs is append-only` |
| Encrypted backups and restore drill | `deploy/backup.sh`: `pg_dump -Fc` → GPG AES-256 → SHA-256 → decrypt verification → 14/8/12 retention → optional rclone off-site sync. Fails closed without `RCLONE_REMOTE` unless `ALLOW_LOCAL_ONLY_BACKUPS=true`. `deploy/restore-drill.sh` restores into a throwaway DB and compares audit chain plus row counts. | Backup created and checksum-verified in demo stack; drill restored 3 users, 215 business records, 126 audit logs and 1 session with an intact chain |
| TLS, WAF and trusted proxy | `docker-compose.tls.yml`: HTTPS on 443 with TLS 1.2/1.3 only, HSTS, HTTP→HTTPS redirect, certbot webroot. `docker-compose.trusted-proxy.yml` opts into `set_real_ip_from` for a named proxy CIDR. Edge filters reject bad methods, dotfiles, backup extensions, traversal, null bytes and scanner UAs. | Local self-signed TLS smoke: 301 redirect, HSTS, TLS 1.2/1.3 accepted and TLS 1.1 rejected, login + audit verification over HTTPS, all 32 smoke checks pass |
| Argon2 benchmarking | `backend/scripts/benchmark_argon2.py` measures median/p95 hash and verify latency for four parameter sets plus the configured default, confirms Argon2id, and recommends a candidate under a target latency. Defaults remain the OWASP baseline. | Benchmark run locally (`m=19456 KiB, t=2, p=1`, ~67 ms hash, ~55 ms verify); `test_argon2_benchmark.py` adds 4 regression tests |
| Audit anomaly alerting | `backend/app/alerting.py` sends deduplicated email/HTTPS-webhook alerts for failed-login bursts, role/status changes, recovery-code issuance, MFA disablement and audit-chain failures. Redis provides cross-worker deduplication; production re-verifies the chain on a schedule. No secrets are included in alerts. | `test_alerting.py` (5 tests) covers burst, privileged events, chain failure on demand and on verification; full backend suite passes |

Three bugs surfaced and were fixed during the Docker smoke test: PostgreSQL
`StringDataRightTruncation` on prefixed IDs, `ModuleNotFoundError: No module
named 'backend'` under uvicorn workers, and nginx failing to create
`/var/run/nginx.pid` as an unprivileged user. Each has a configuration/code fix
and, for the ID bug, a regression test.

### 11.2 Verification executed

- `npm run verify` — **21 frontend tests**, lint, production build and `npm audit --audit-level=high` pass; **0 npm vulnerabilities**.
- `npm run verify:backend` — **90 backend tests**, `pip-audit` and Bandit pass (0 findings after explicit `nosec` justifications for the benchmark fixture and validated HTTPS webhook call).
- `cd backend && alembic upgrade head && alembic check` — **No new upgrade operations detected**.
- Compose config validated for the demo stack, the base production stack with the TLS overlay, and the trusted-proxy overlay. The production `docker compose config` fails closed when required role/backup/TLS secrets are absent, so CI validates with the demo template.
- Fresh-volume Docker demo smoke test through nginx on port 8080:
  - `/health` returned `{"status":"ok"}`; SPA root returned 200 with the JS Baking House title; CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP and CORP headers present; `index.html` sent `Cache-Control: no-store`.
  - Owner login returned a user and CSRF token; `/auth/me` confirmed the registered email; snapshot returned `inventory=18, movements=101, suppliers=5, products=8, purchases=10, sales=40, expenses=18, production=15`.
  - Audit verification returned `{"valid":true,"checked":126,"first_invalid_sequence":null}` before and after the full smoke test.
  - Owner issued a one-time reset code for `brian`, redeemed it, the old password returned 401 and the new password logged in.
  - MFA enrolment produced a 32-character secret and 10 recovery codes; enabling MFA made the next login return a challenge; the challenge completed and created a session. PostgreSQL stored the secret as `gAAAAABq...` (140 chars) with 10 recovery-code hashes, confirming encryption at rest.
  - Redis limiter returned 401 for five bad logins and 429 on the sixth.
- Database hardening verification against the deployed stack: encrypted connection, dedicated roles, correct privileges and append-only audit trigger all passed; `show ssl` returned `on`; a direct `UPDATE audit_logs` failed with `ERROR: audit_logs is append-only`.
- Backup/restore drill: a fresh encrypted backup restored into `jsbh_restore_drill`; the audit chain was intact and counts matched live (`users: 3`, `business_records: 215`, `audit_logs: 138`, `sessions: 3`).
- TLS overlay smoke with a local self-signed certificate: HTTP 80 returned `301` to HTTPS, HSTS and all security headers were present, TLS 1.2 and 1.3 succeeded while TLS 1.1 was rejected, login and `/audit/verify` worked over HTTPS, and the SPA root/assets returned 200. `deploy/security-smoke.sh` passed **32/32 checks**, including WAF filters and rate limiting.

### 11.3 Commands

```bash
# Local demo (public throwaway credentials, dev codes visible once)
cp deploy/demo.env.example .env
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
# open http://localhost:8080

# Production-shaped stack (secrets from .env, no demo seed)
cp .env.example .env   # then fill in the required values
docker compose up --build -d

# Verification
npm run verify && npm run verify:backend
cd backend && alembic upgrade head && alembic check
python backend/scripts/benchmark_argon2.py --samples 5 --target-ms 500

docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.demo.yml config --quiet
TLS_DOMAIN=localhost TLS_EMAIL=dev@example.com \
  docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.tls.yml config --quiet

docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.demo.yml run --rm \
  --entrypoint python backend backend/scripts/verify_database_hardening.py
BACKUP_ENV_FILE=deploy/demo.env.example BACKUP_EXTRA_FILES='-f docker-compose.demo.yml' deploy/restore-drill.sh
BASE_URL=http://127.0.0.1:8080 deploy/security-smoke.sh

# TLS smoke with a throwaway certificate (local only)
deploy/generate-dev-cert.sh /tmp/jsbh-tls localhost
TLS_DOMAIN=localhost TLS_EMAIL=dev@example.com TLS_CERT_DIR=/tmp/jsbh-tls \
  docker compose --env-file deploy/demo.env.example -f docker-compose.yml -f docker-compose.tls.yml up -d
BASE_URL=https://127.0.0.1:18443 HTTP_URL=http://127.0.0.1:18080 \
  EXPECT_TLS=true INSECURE_TLS=true deploy/security-smoke.sh
```

### 11.4 Residual gaps and required operator actions

Closed in this repository (evidence above): encrypted backups and a rehearsed
restore; TLS/WAF/HSTS/trusted-proxy overlays; least-privilege database roles
with append-only audit enforcement; Argon2id benchmarking tooling; audit
anomaly alerting; and an automated 32-check security smoke script.

Still required by the operator or an external reviewer:

1. Install a **trusted TLS certificate** (or configure a controlled upstream
   TLS terminator with the trusted-proxy overlay). The local self-signed smoke
   test proves the configuration, not production trust.
2. Configure **off-site backup storage** (`RCLONE_REMOTE`) and repeat the
   restore drill at the production site; record an RPO/RTO. Demo mode uses
   `ALLOW_LOCAL_ONLY_BACKUPS=true` and public throwaway secrets.
3. Re-run `benchmark_argon2.py` on the **target instance class** with realistic
   concurrency and record the chosen parameters.
4. Set real SMTP, MFA encryption, alert destinations, CORS/frontend origins and
   rotate all demo credentials. Configure central log shipping and monitor
   alert delivery.
5. Complete a formal threat model/data-flow review for ASVS V1.
6. Commission an **independent OWASP ASVS 5.0.0 Level 2 assessment** and an
   **authorised penetration test** against staging. `ASVS_EVIDENCE.md` provides
   the evidence pack and preparation checklist; it is not external sign-off.

**No production-ready, hardened or compliant claim is made.** The stack is
built and smoke-tested, and the controls above are implemented with automated
and live verification, but the remaining items require operator action and
independent assurance before production use.
