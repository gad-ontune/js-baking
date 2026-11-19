#!/bin/sh
# Render the nginx templates from environment variables, then start nginx.
# Only our own placeholders are substituted so nginx variables such as $host
# and $remote_addr survive into the final configuration.
set -eu

VARS='$JSBH_HTTP_PORT $JSBH_SERVER_NAME $JSBH_REDIRECT_TO_HTTPS $JSBH_TLS_SERVER $JSBH_REAL_IP_CONFIG $JSBH_HSTS_HEADER $JSBH_FORWARDED_FOR $JSBH_FORWARDED_PROTO'

for name in nginx.conf nginx-headers.conf server-locations.conf; do
  envsubst "$VARS" < "/etc/nginx/templates/${name}.template" > "/etc/nginx/${name}"
done

exec nginx -g 'daemon off;'
