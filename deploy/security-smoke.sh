#!/bin/sh
# Automated, read-only security smoke checks against a running deployment.
#
#   BASE_URL=https://bakery.example.com EXPECT_TLS=true deploy/security-smoke.sh
#   BASE_URL=https://127.0.0.1:18443 HTTP_URL=http://127.0.0.1:18080 \
#     EXPECT_TLS=true INSECURE_TLS=true deploy/security-smoke.sh
#
# INSECURE_TLS=true only exists for local self-signed smoke tests. Never use it
# against a real deployment. The script does not create or modify business data;
# the only side effects are audit entries for intentionally failed sign-ins.
set -eu

BASE_URL=${BASE_URL:-http://127.0.0.1:8080}
HTTP_URL=${HTTP_URL:-http://127.0.0.1:8080}
EXPECT_TLS=${EXPECT_TLS:-false}
INSECURE_TLS=${INSECURE_TLS:-false}

CURL_FLAGS='--max-time 12 -sS'
if [ "$INSECURE_TLS" = 'true' ]; then
  CURL_FLAGS="$CURL_FLAGS -k"
fi

failures=0

_pass() { printf '[PASS] %s\n' "$1"; }
_fail() { printf '[FAIL] %s: %s\n' "$1" "$2" >&2; failures=$((failures + 1)); }

_expect_status() {
  label=$1
  expected=$2
  path=$3
  shift 3
  # Word splitting of CURL_FLAGS and "$@" is intentional for curl options.
  # shellcheck disable=SC2086
  actual=$(curl $CURL_FLAGS "$@" -o /dev/null -w '%{http_code}' "${BASE_URL}${path}" 2>/dev/null || true)
  if [ "$actual" = "$expected" ]; then
    _pass "$label ($actual)"
  else
    _fail "$label" "expected $expected, got $actual"
  fi
}

_headers() {
  path=$1
  shift
  # shellcheck disable=SC2086
  curl $CURL_FLAGS "$@" -D - -o /dev/null "${BASE_URL}${path}" 2>/dev/null || true
}

_expect_header() {
  label=$1
  headers=$2
  header=$3
  if printf '%s\n' "$headers" | grep -qi "^${header}:"; then
    _pass "$label"
  else
    _fail "$label" "missing $header header"
  fi
}

echo "[jsbh-smoke] Target: $BASE_URL"

# --- Availability and authentication boundaries -------------------------
_expect_status 'health endpoint' 200 /health
_expect_status 'SPA root' 200 /
_expect_status 'unauthenticated audit API' 401 /api/v1/audit
_expect_status 'unauthenticated business API' 401 /api/v1/business/snapshot
_expect_status 'unauthenticated user API' 401 /api/v1/users

# --- Edge WAF rules ------------------------------------------------------
_expect_status 'disallowed HTTP method' 405 / -X PUT
_expect_status 'dotfile access' 403 /.env
_expect_status 'hidden VCS directory' 403 /.git/config
_expect_status 'database backup extension' 403 /backup.sql
_expect_status 'path traversal' 400 /api/../../etc/passwd --path-as-is
_expect_status 'null byte in path' 400 /api/%00 --path-as-is
_expect_status 'scanner user agent' 403 / -A 'sqlmap/1.0'
_expect_status 'second scanner user agent' 403 / -A 'nikto/2.1'

# --- Credential-stuffing limiter -----------------------------------------
probe_user="probe-$(date -u +%s)-$$"
for attempt in 1 2 3 4 5; do
  _expect_status "bad login $attempt" 401 /api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${probe_user}\",\"password\":\"not-a-real-password\"}"
done
_expect_status 'bad login 6 (rate limited)' 429 /api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${probe_user}\",\"password\":\"not-a-real-password\"}"

# --- Response headers ----------------------------------------------------
root_headers=$(_headers /)
_expect_header 'CSP header' "$root_headers" 'Content-Security-Policy'
_expect_header 'X-Content-Type-Options' "$root_headers" 'X-Content-Type-Options'
_expect_header 'X-Frame-Options' "$root_headers" 'X-Frame-Options'
_expect_header 'Referrer-Policy' "$root_headers" 'Referrer-Policy'
_expect_header 'Permissions-Policy' "$root_headers" 'Permissions-Policy'
_expect_header 'Cross-Origin-Opener-Policy' "$root_headers" 'Cross-Origin-Opener-Policy'
_expect_header 'Cross-Origin-Resource-Policy' "$root_headers" 'Cross-Origin-Resource-Policy'
if printf '%s\n' "$root_headers" | grep -qi '^Server: nginx/[0-9]'; then
  _fail 'nginx version disclosure' 'Server header includes a version number'
else
  _pass 'no nginx version disclosure'
fi

api_headers=$(_headers /api/v1/audit)
_expect_header 'API no-store header' "$api_headers" 'Cache-Control'

if [ "$EXPECT_TLS" = 'true' ]; then
  _expect_header 'HSTS header' "$root_headers" 'Strict-Transport-Security'
  # shellcheck disable=SC2086
  redirect_code=$(curl $CURL_FLAGS -o /dev/null -w '%{http_code}' "${HTTP_URL}/" 2>/dev/null || true)
  if [ "$redirect_code" = '301' ]; then
    _pass "HTTP to HTTPS redirect ($redirect_code)"
  else
    _fail 'HTTP to HTTPS redirect' "expected 301, got $redirect_code"
  fi
  # shellcheck disable=SC2086
  redirect_location=$(curl $CURL_FLAGS -D - -o /dev/null "${HTTP_URL}/" 2>/dev/null | grep -i '^Location:' || true)
  if printf '%s' "$redirect_location" | grep -qi 'https://'; then
    _pass 'HTTPS redirect target'
  else
    _fail 'HTTPS redirect target' "unexpected Location: $redirect_location"
  fi
else
  if printf '%s\n' "$root_headers" | grep -qi '^Strict-Transport-Security:'; then
    _fail 'HSTS in HTTP mode' 'HSTS should not be sent on plaintext HTTP'
  else
    _pass 'no HSTS on plaintext HTTP (expected)'
  fi
fi

# --- Public page must not contain demo credentials -----------------------
# shellcheck disable=SC2086
root_body=$(curl $CURL_FLAGS "${BASE_URL}/" 2>/dev/null || true)
if printf '%s' "$root_body" | grep -q 'JSBH-Owner-2026'; then
  _fail 'demo credentials in HTML' 'owner password found in the public page'
else
  _pass 'no demo credentials in public HTML'
fi

if [ "$failures" -ne 0 ]; then
  printf '[jsbh-smoke] %s check(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '[jsbh-smoke] All security smoke checks passed.\n'
