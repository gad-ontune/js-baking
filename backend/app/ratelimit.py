"""Rate limiting with an optional Redis-backed shared store.

A single-process in-memory limiter is used when REDIS_URL is unset (local
development and tests). In a multi-worker deployment, Redis makes limits apply
to every worker. When Redis is configured but unavailable, security-sensitive
requests fail closed instead of silently losing all limits.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

from .config import settings

TOO_MANY = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail='Too many attempts. Try again shortly.',
)
UNAVAILABLE = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail='Rate limiting is temporarily unavailable.',
)


class InMemoryRateLimiter:
    """Small in-memory limiter suitable for a single-process demo backend."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and events[0] <= now - window_seconds:
                events.popleft()
            if len(events) >= limit:
                raise TOO_MANY

    def record(self, key: str, window_seconds: int = 900) -> None:
        with self._lock:
            self._events[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def clear_all(self) -> None:
        with self._lock:
            self._events.clear()


class RedisRateLimiter:
    """Fixed-window limiter backed by Redis INCR + EXPIRE."""

    PREFIX = 'jsbh:ratelimit:'

    def __init__(self, client) -> None:
        self._client = client

    def _key(self, key: str) -> str:
        # Keep keys bounded and namespace them so cleanup cannot touch other data.
        return self.PREFIX + key[:128]

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        try:
            value = self._client.get(self._key(key))
        except Exception as exc:  # redis errors vary by driver/version
            raise UNAVAILABLE from exc
        if value is None:
            return
        try:
            if int(value) >= limit:
                raise TOO_MANY
        except (TypeError, ValueError) as exc:
            raise UNAVAILABLE from exc

    def record(self, key: str, window_seconds: int = 900) -> None:
        try:
            count = self._client.incr(self._key(key))
            if count == 1:
                self._client.expire(self._key(key), max(1, window_seconds))
        except Exception as exc:
            raise UNAVAILABLE from exc

    def clear(self, key: str) -> None:
        try:
            self._client.delete(self._key(key))
        except Exception as exc:
            raise UNAVAILABLE from exc

    def clear_all(self) -> None:
        try:
            keys = list(self._client.scan_iter(match=self.PREFIX + '*', count=100))
            if keys:
                self._client.delete(*keys)
        except Exception as exc:
            raise UNAVAILABLE from exc


def _build_limiter():
    if not settings.redis_url:
        return InMemoryRateLimiter()
    try:
        import redis  # imported lazily so local installs need no Redis dependency
    except ImportError as exc:
        raise RuntimeError('REDIS_URL is set but the redis package is not installed.') from exc
    client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return RedisRateLimiter(client)


rate_limiter = _build_limiter()
