#!/bin/sh
# Generate a throwaway self-signed certificate for LOCAL TLS SMOKE TESTS ONLY.
# Never use this in a deployment. Usage:
#
#   deploy/generate-dev-cert.sh /tmp/jsbh-tls localhost
set -eu

DIR=${1:-}
DOMAIN=${2:-localhost}
[ -n "$DIR" ] || { echo 'Usage: generate-dev-cert.sh <directory> <domain>' >&2; exit 2; }

mkdir -p "$DIR/live/$DOMAIN"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -keyout "$DIR/live/$DOMAIN/privkey.pem" \
  -out "$DIR/live/$DOMAIN/fullchain.pem" \
  -subj "/CN=$DOMAIN" 2>/dev/null
# UID 10001 is the unprivileged nginx user inside the web container.
chmod 0644 "$DIR/live/$DOMAIN/privkey.pem" "$DIR/live/$DOMAIN/fullchain.pem"
echo "Generated a development-only certificate for $DOMAIN in $DIR"
