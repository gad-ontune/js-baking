# PostgreSQL image with a generated internal TLS certificate. The database is
# never published to the host; TLS protects traffic inside the Compose network.
FROM postgres:16-alpine

RUN apk add --no-cache openssl

COPY deploy/db-init/ /docker-entrypoint-initdb.d/
