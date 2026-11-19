"""Rate limiter behaviour for both the in-memory and shared Redis backends."""

import pytest
from fastapi import HTTPException

from backend.app.ratelimit import InMemoryRateLimiter, RedisRateLimiter


class FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def incr(self, key):
        self.values[key] = int(self.values.get(key, 0)) + 1
        return self.values[key]

    def expire(self, key, seconds):
        assert seconds >= 1

    def delete(self, *keys):
        count = 0
        for key in keys:
            if key in self.values:
                del self.values[key]
                count += 1
        return count

    def scan_iter(self, match, count=100):
        prefix = match.replace('*', '')
        return [key for key in self.values if key.startswith(prefix)]


@pytest.mark.parametrize('make_limiter', [InMemoryRateLimiter, lambda: RedisRateLimiter(FakeRedis())])
def test_limiter_blocks_after_the_configured_number_of_failures(make_limiter):
    limiter = make_limiter()
    for _ in range(3):
        limiter.check('login:user:amina', 3, 60)
        limiter.record('login:user:amina', 60)

    with pytest.raises(HTTPException) as exc:
        limiter.check('login:user:amina', 3, 60)
    assert exc.value.status_code == 429

    limiter.clear('login:user:amina')
    limiter.check('login:user:amina', 3, 60)


def test_redis_limiter_namespaces_keys_and_can_clear_all():
    client = FakeRedis()
    limiter = RedisRateLimiter(client)
    limiter.record('login:ip:127.0.0.1', 60)
    limiter.record('verify:user:usr_1', 60)
    assert set(client.values) == {'jsbh:ratelimit:login:ip:127.0.0.1', 'jsbh:ratelimit:verify:user:usr_1'}

    limiter.clear_all()
    assert client.values == {}


def test_redis_failure_fails_closed():
    class BrokenRedis(FakeRedis):
        def get(self, key):
            raise OSError('redis unavailable')

    limiter = RedisRateLimiter(BrokenRedis())
    with pytest.raises(HTTPException) as exc:
        limiter.check('login:user:amina', 5, 60)
    assert exc.value.status_code == 503
