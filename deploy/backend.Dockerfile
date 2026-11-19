# Production API image. Runs as an unprivileged user; schema changes are
# applied by Alembic at startup, never by the application process.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN groupadd --gid 10001 jsbh \
 && useradd --uid 10001 --gid jsbh --no-create-home --shell /usr/sbin/nologin jsbh

COPY backend/requirements.txt ./backend/requirements.txt
RUN python -m pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY deploy/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backend-entrypoint.sh \
 && chown -R jsbh:jsbh /app

USER jsbh
EXPOSE 8000

ENTRYPOINT ["backend-entrypoint.sh"]
