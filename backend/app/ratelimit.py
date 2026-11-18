import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class RateLimiter:
    """Small in-memory limiter suitable for a single-process demo backend.

    Production deployments should replace this with a shared Redis-backed
    limiter so limits apply across all application workers.
    """

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
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail='Too many attempts. Try again shortly.',
                )

    def record(self, key: str) -> None:
        with self._lock:
            self._events[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def clear_all(self) -> None:
        with self._lock:
            self._events.clear()


rate_limiter = RateLimiter()
