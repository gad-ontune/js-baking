"""Shared fixtures. Environment is configured before any app module is imported."""

import os
import tempfile

_TEST_DB_DIR = tempfile.mkdtemp(prefix='jsbh-test-')
os.environ['DATABASE_URL'] = f'sqlite:///{_TEST_DB_DIR}/test.db'
os.environ['ENVIRONMENT'] = 'test'
os.environ['CORS_ORIGINS'] = 'http://testserver'
os.environ['COOKIE_SECURE'] = 'false'
os.environ['COOKIE_SAMESITE'] = 'lax'
os.environ.pop('SEED_OWNER_PASSWORD', None)
os.environ.pop('SEED_OWNER_USERNAME', None)
os.environ.pop('SEED_OWNER_EMAIL', None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.database import Base, SessionLocal, engine  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.ratelimit import rate_limiter  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    rate_limiter.clear_all()
    yield
    rate_limiter.clear_all()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
