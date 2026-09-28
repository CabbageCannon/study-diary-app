"""Give pre-account API tests a signed-in administrator fixture."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthIdentity
from app.models import UserProfile


TEST_USER_ID = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def legacy_authenticated_client(monkeypatch, request):
    if request.module.__name__ == "tests.test_user_accounts":
        yield
        return

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    UserProfile.__table__.create(engine)
    sessions = sessionmaker(bind=engine)

    async def verify(_token: str) -> AuthIdentity:
        return AuthIdentity(TEST_USER_ID, "legacy-test@example.com")

    original_request = TestClient.request

    def authenticated_request(self, method, url, **kwargs):
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.setdefault("Authorization", "Bearer legacy-test")
        return original_request(self, method, url, headers=headers, **kwargs)

    monkeypatch.setattr("app.main.verify_session", verify)
    monkeypatch.setattr("app.main.SessionLocal", sessions)
    monkeypatch.setattr("app.main.settings.admin_user_id", TEST_USER_ID)
    monkeypatch.setattr(TestClient, "request", authenticated_request)
    yield
    engine.dispose()
