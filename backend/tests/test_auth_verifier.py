"""A bearer token is useful only after Supabase confirms its identity."""

import asyncio
import base64
import json
import time
from unittest.mock import patch

import httpx
import pytest

from app.auth import AuthFailure, _verified_tokens, verify_session


def token(expiry: int, suffix: str = "x") -> str:
    claims = base64.urlsafe_b64encode(json.dumps({"exp": expiry, "test": suffix}).encode()).decode().rstrip("=")
    return f"header.{claims}.signature"


def test_verifier_checks_supabase_confirmation_and_expiry() -> None:
    calls = []
    confirmed = True

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={
            "id": "11111111-1111-4111-8111-111111111111",
            "email": "verified@example.com",
            "email_confirmed_at": "2026-09-24T00:00:00Z" if confirmed else None,
        })

    _verified_tokens.clear()
    client_factory = httpx.AsyncClient
    with (
        patch("app.auth.settings.supabase_url", "https://project.supabase.co"),
        patch("app.auth.settings.supabase_publishable_key", "public-key"),
        patch("app.auth.httpx.AsyncClient", side_effect=lambda **_: client_factory(transport=httpx.MockTransport(respond))),
    ):
        valid = token(int(time.time()) + 300)
        first = asyncio.run(verify_session(valid))
        second = asyncio.run(verify_session(valid))
        assert first == second
        assert first.email == "verified@example.com"
        assert len(calls) == 1
        assert calls[0].headers["Authorization"] == f"Bearer {valid}"
        with pytest.raises(AuthFailure):
            asyncio.run(verify_session(token(int(time.time()) - 1)))
        confirmed = False
        with pytest.raises(AuthFailure) as unconfirmed:
            asyncio.run(verify_session(token(int(time.time()) + 300, "unconfirmed")))
        assert unconfirmed.value.status_code == 403
    _verified_tokens.clear()
