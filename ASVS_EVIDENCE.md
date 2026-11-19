# ASVS 5.0.0 self-assessment and evidence record

**Purpose.** This document records the evidence available for an OWASP ASVS
5.0.0 Level 2 review of the JS Baking House application. It is a *self-
assessment*, not a certification or a claim of compliance. Statuses describe
what is implemented and what evidence exists in this repository; they do not
replace an independent assessor's judgement.

**Scope.** React SPA, FastAPI backend, PostgreSQL, Redis, nginx, Docker Compose
deployment, backup/restore tooling and the CI pipeline in this repository.
Out of scope: the hosting provider's physical/network controls, corporate IAM,
the email provider, third-party CDN/WAF configuration and client devices.

**Assessment date:** 2026-11-19 · **Branch:** `main` · **Commit:** see `git rev-parse --short HEAD`.

---

## 1. Status summary

| ASVS 5.0 area | Status | Evidence |
|---|---|---|
| V1 Architecture and Design | Partial | Architecture and threat notes in `SECURITY_ASSESSMENT.md`; no independently signed-off threat model or data-flow review. |
| V2 Authentication | Implemented — evidence automated | Argon2id + password policy, TOTP MFA, single-use recovery, email verification, Redis-shared failed-login limits. `test_security.py`, `test_recovery.py`, `test_mfa.py`, `test_ratelimit.py`, `test_argon2_benchmark.py`. |
| V3 Session Management | Implemented — evidence automated | HttpOnly/SameSite/Secure cookies, server-side session table, idle/absolute expiry, revocation on password/role/status change. `test_security.py`, `test_mfa.py`, `test_recovery.py`. |
| V4 Access Control | Implemented — evidence automated | Server-side RBAC and object-level checks; owner-only audit and user management; frontend guards mirror but do not enforce permissions. `test_business.py`, `test_audit_chain.py`. |
| V5 Validation and Sanitisation | Implemented — evidence automated | Pydantic request schemas, strict business-record validation, React output encoding, neutralised CSV formula injection, CSP. `test_business.py`, `npm run verify`. |
| V6 Stored Cryptography | Implemented — evidence automated | Argon2id password hashes, Fernet-encrypted MFA secrets, SHA-256 one-way token digests, AES-256-GPG backups, internal PostgreSQL TLS. `test_mfa.py`, `test_recovery.py`, backup drill. |
| V7 Error Handling and Logging | Implemented — evidence automated | Append-only audit hash chain, generic error responses, no secrets in logs, anomaly alerts. `test_audit_chain.py`, `test_alerting.py`. |
| V8 Data Protection | Implemented — evidence automated | No plaintext/reversible passwords, no DELETE endpoints, reversal-only financial records, encrypted backups with retention. `test_business.py`, restore drill. |
| V9 Communications | Implemented — operator TLS required | HTTPS overlay: TLS 1.2/1.3 only, HSTS, HTTP→HTTPS redirect, internal DB TLS. Self-signed smoke verified; **production needs a trusted certificate**. `docker-compose.tls.yml`, `deploy/security-smoke.sh`. |
| V10 Malicious Code | Implemented — evidence automated | Non-root container users, no `eval`/`innerHTML`, CSP, pinned dependencies, Gitleaks/Semgrep/Bandit/pip-audit/npm audit in CI. |
| V11 Business Logic | Implemented — evidence automated | Server-computed stock and totals, negative-stock prevention, reversal semantics, active-owner invariant. `test_business.py`, `test_business_seed.py`, `test_demo_reset.py`. |
| V12 Files and Resources | Implemented — edge rules verified | No file upload feature, hashed static assets, dotfile/backup-extension deny, hidden-directory deny. `deploy/security-smoke.sh`. |
| V13 API and Web Service | Implemented — evidence automated | Same-origin API, CSRF double-submit, typed routes, rate limits, request-size cap, no DELETE routes, WAF-style request filters. `test_ratelimit.py`, `test_business.py`, smoke script. |
| V14 Configuration | Implemented — evidence automated | Alembic owns schema, three least-privilege DB roles, append-only audit trigger, secret-only configuration, fail-closed production checks, CI gates. `verify_database_hardening.py`, CI workflow. |

**Overall:** the application implements a strong, testable baseline for the
listed areas. **Independent ASVS Level 2 verification and authorised
penetration testing have not been performed** and are required before any
compliance claim.

---

## 2. Evidence catalogue

### 2.1 Authentication, sessions and recovery

| Control | Evidence / command | Expected result |
|---|---|---|
| Argon2id password hashing with OWASP baseline parameters | `backend/scripts/benchmark_argon2.py --samples 5 --target-ms 500` | Reports `Argon2 type used by the API: ID`; current default `m=19456 KiB, t=2, p=1`; re-run on target hardware. |
| Password policy | `npm run verify:backend` → `test_security.py` | Short, whitespace-padded and common passwords are rejected. |
| TOTP MFA | `test_mfa.py` | Secret encrypted at rest, 10 hashed recovery codes, no session issued before challenge completion. |
| Owner-only password recovery | `test_recovery.py` | Username **and** email required; generic response; one-time expiring token; all sessions revoked. |
| Staff recovery codes | `test_recovery.py` | Owner-only; token shown once; password hashes never displayed. |
| Shared failed-login limiter | `test_ratelimit.py`; smoke script | Five 401s then 429 on the sixth attempt; shared through Redis in deployments. |
| Cookie hardening | `config.py`, `docker-compose.yml` | `COOKIE_SECURE=true`, HttpOnly session cookies, SameSite=Lax, CSRF cookie mirrored to a header. |

### 2.2 Access control

| Control | Evidence / command | Expected result |
|---|---|---|
| Server-authoritative RBAC | `test_business.py` | Staff cannot perform owner/manager actions even if the UI is bypassed. |
| Object-level checks | `test_business.py` | Staff get 404 for another user's record; no existence leak. |
| Owner-only audit and admin APIs | `test_audit_chain.py` | Anonymous 401, staff 403, owner 200. |
| No privilege changes from request bodies | `routers/users.py` | Role/active status set server-side; self-demotion and last-owner removal blocked. |

### 2.3 Cryptography and data protection

| Control | Evidence / command | Expected result |
|---|---|---|
| Password storage | Database inspection | `password_hash` starts with `$argon2id$`; no plaintext column exists. |
| MFA secret storage | `test_mfa.py` | Fernet ciphertext (`gAAAAA...`) in `mfa_secret`; recovery codes hashed. |
| Token storage | `test_recovery.py` | Only SHA-256 digests in `security_tokens`. |
| Backup encryption | `deploy/backup.sh` | `pg_dump -Fc` → GPG AES-256 → SHA-256 checksum → decrypt verification before success. |
| Restore rehearsal | `BACKUP_ENV_FILE=deploy/demo.env.example BACKUP_EXTRA_FILES='-f docker-compose.demo.yml' deploy/restore-drill.sh` | Takes a fresh encrypted backup by default, restores into a throwaway DB; audit chain valid; row counts match live. |
| Database transport encryption | `verify_database_hardening.py` | `ssl = on`; API DSNs use `sslmode=require`. |

### 2.4 Logging, monitoring and alerting

| Control | Evidence / command | Expected result |
|---|---|---|
| Append-only audit chain | `test_audit_chain.py`; `GET /api/v1/audit/verify` | Consecutive sequence numbers, valid chain, tampering detected. |
| DB-enforced append-only audit | `verify_database_hardening.py`; direct `UPDATE audit_logs` as bootstrap role | Append-only trigger rejects mutation with `audit_logs is append-only`. |
| Anomaly alerts | `test_alerting.py` | Failed-login bursts, role/status changes, recovery-code issuance and chain failures generate one deduplicated alert each. |
| Scheduled chain check | `main.py` lifespan | In production with alerts configured, chain is re-verified every `AUDIT_CHECK_INTERVAL_MINUTES`. |
| No secret leakage in errors | `main.py` validation/error handlers | Field names and generic messages only; submitted values never echoed. |

### 2.5 Communications and configuration

| Control | Evidence / command | Expected result |
|---|---|---|
| Public HTTPS | `docker-compose.tls.yml` + real certificate | TLS 1.2/1.3 only, HSTS, HTTP→HTTPS redirect; verified locally with a self-signed cert. |
| Trusted proxy | `docker-compose.trusted-proxy.yml` | `set_real_ip_from` only for the configured proxy CIDR; direct peer otherwise. |
| Least-privilege DB roles | `verify_database_hardening.py` | Bootstrap only provisions; Alembic uses `jsbh_owner`; API uses `jsbh_app` without schema rights or audit `UPDATE`/`DELETE`. |
| Schema ownership | `alembic upgrade head && alembic check` | Clean; runtime sets `AUTO_CREATE_SCHEMA=false`. |
| Edge request filtering | `deploy/security-smoke.sh` | 405 for PUT, 403 for dotfiles/scanners, 400 for traversal/null bytes, nginx version hidden. |
| CI gates | `.github/workflows/ci.yml` | Tests, lint, build, npm audit, pip-audit, Bandit, Alembic check, Gitleaks, Semgrep on every push/PR. |

---

## 3. Automated security verification

Run these against a deployed stack (use `INSECURE_TLS=true` only with a local
self-signed certificate):

```bash
# HTTP demo stack
BASE_URL=http://127.0.0.1:8080 deploy/security-smoke.sh

# TLS overlay, local smoke certificate
BASE_URL=https://127.0.0.1:18443 HTTP_URL=http://127.0.0.1:18080 \
  EXPECT_TLS=true INSECURE_TLS=true deploy/security-smoke.sh

# Real deployment (certificate must validate)
BASE_URL=https://bakery.example.com HTTP_URL=http://bakery.example.com \
  EXPECT_TLS=true deploy/security-smoke.sh
```

Latest local result (self-signed TLS smoke, 2026-11-19): **32 checks passed**,
covering auth boundaries, WAF filters, rate limiting, security headers, HSTS,
redirect, no version disclosure and no demo credentials in the SPA shell.

Source and dependency scans are already automated in CI: Gitleaks for secrets,
Semgrep for insecure code patterns, Bandit for Python, `npm audit` and
`pip-audit` for dependencies, plus `npm run verify` and `npm run verify:backend`.

---

## 4. Operator steps still required before production

These cannot be completed honestly inside this repository:

1. Obtain and install a trusted TLS certificate (`TLS_DOMAIN`, `TLS_EMAIL`,
   `TLS_CERT_DIR`), or use a controlled upstream TLS terminator with the
   trusted-proxy overlay. Do not use `deploy/generate-dev-cert.sh` in production.
2. Configure off-site backups (`RCLONE_REMOTE` plus a mounted rclone config).
   `ALLOW_LOCAL_ONLY_BACKUPS=true` is for demos only. Repeat the restore drill
   at the production site and record an RPO/RTO.
3. Re-run `backend/scripts/benchmark_argon2.py` on the production instance class
   with realistic concurrency and record the chosen parameters.
4. Set real SMTP credentials, `MFA_ENCRYPTION_KEY`, alert destinations,
   `CORS_ORIGINS`/`FRONTEND_URL`, and rotate all demo/throwaway secrets.
5. Restrict network access to the host, configure central log shipping and
   alert-delivery monitoring, and define an incident-response contact path.
6. Complete a formal threat model/data-flow review (ASVS V1) and keep secrets
   out of shell history and images.
7. Commission an **independent ASVS 5.0.0 Level 2 assessment** and an
   **authorised penetration test** against a staging environment. This
   repository provides evidence and a smoke script, not an external sign-off.

---

## 5. Penetration-test preparation checklist

Provide the tester with:

- [ ] Written scope: public origin(s), API paths, allowed test windows and
      explicitly excluded systems (email provider, hosting control plane).
- [ ] Rules of engagement: permitted techniques, rate-limit coordination,
      stop conditions, emergency contact and data-handling requirements.
- [ ] Two non-production test accounts: owner and staff, with MFA disabled or
      authenticator seeds supplied by the operator.
- [ ] A staging database restored from a sanitised backup; never use live
      customer data.
- [ ] This document, `SECURITY_ASSESSMENT.md`, `README.md` and the commit SHA.
- [ ] Confirmation that `deploy/security-smoke.sh`, `npm run verify`,
      `npm run verify:backend`, DB hardening verification and restore drill
      already pass, so testing starts from a known-good baseline.

Out-of-scope by design for an unauthenticated tester: destructive business
actions without credentials, backup decryption material, and production data.
The application intentionally has no `DELETE` endpoints; reversals are the only
cancellation mechanism.

---

## 6. Sign-off record (to be completed by the external reviewer)

| Field | Value |
|---|---|
| Reviewer / firm | |
| Assessment type | ASVS 5.0.0 L2 / authorised penetration test |
| Dates | |
| Commit SHA / environment | |
| Findings and severity | |
| Retest status | |
| Final statement | |

**No compliance or certification claim is made until this section is completed
by a qualified independent reviewer.**
