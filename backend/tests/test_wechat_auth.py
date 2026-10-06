import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthIdentity, issue_miniapp_token, verify_session
from app.database import Base
from app.models import UserProfile
from app.services.wechat_auth_service import bind_openid, exchange_login_code, login_or_create


def test_wechat_identity_creation_binding_and_signed_token(monkeypatch) -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr("app.auth.settings.miniapp_jwt_secret", "test-secret")
    monkeypatch.setattr("app.auth.settings.miniapp_token_ttl_seconds", 3600)
    with sessions() as db:
        assert login_or_create(db, "openid-one", None, create=False) is None
        created = login_or_create(db, "openid-one", "union-one", create=True)
        assert created is not None
        assert created.user_id
        assert created.email.endswith("@local.invalid")
        token, _ = issue_miniapp_token(created)
        verified = asyncio.run(verify_session(token))
        assert verified == created

        existing = AuthIdentity("11111111-1111-4111-8111-111111111111", "existing@example.com")
        db.add(UserProfile(id=existing.user_id, email=existing.email))
        db.commit()
        assert bind_openid(db, "openid-two", None, existing.user_id) == existing
        with pytest.raises(HTTPException) as conflict:
            bind_openid(db, "openid-two", None, created.user_id)
        assert conflict.value.status_code == 409
    engine.dispose()


def test_exchange_hides_session_key_and_rejects_wechat_error(monkeypatch) -> None:
    async_client = httpx.AsyncClient

    def success(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"openid": "openid", "unionid": "unionid", "session_key": "never-return"})

    monkeypatch.setattr("app.services.wechat_auth_service.settings.wechat_mini_app_id", "wx-test")
    monkeypatch.setattr("app.services.wechat_auth_service.settings.wechat_mini_app_secret", "secret")
    with patch("app.services.wechat_auth_service.httpx.AsyncClient", side_effect=lambda **_: async_client(transport=httpx.MockTransport(success))):
        assert asyncio.run(exchange_login_code("code")) == ("openid", "unionid")

    def rejected(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"errcode": 40029, "errmsg": "invalid code"})

    with patch("app.services.wechat_auth_service.httpx.AsyncClient", side_effect=lambda **_: async_client(transport=httpx.MockTransport(rejected))):
        with pytest.raises(HTTPException) as failure:
            asyncio.run(exchange_login_code("bad-code"))
        assert failure.value.status_code == 401
