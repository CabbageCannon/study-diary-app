"""Authenticate Supabase sessions before accessing application data."""

from __future__ import annotations

import json
from base64 import urlsafe_b64decode
from dataclasses import dataclass
from time import time
from uuid import UUID

import httpx

from app.config import settings


@dataclass(frozen=True)
class AuthIdentity:
    user_id: str
    email: str


class AuthFailure(Exception):
    def __init__(self, detail: str, status_code: int = 401) -> None:
        super().__init__(detail)
        self.status_code = status_code


_verified_tokens: dict[str, tuple[AuthIdentity, float]] = {}


def _token_expiry(token: str) -> float:
    try:
        encoded = token.split(".")[1]
        claims = json.loads(urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        return float(claims["exp"])
    except (IndexError, KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AuthFailure("登录凭据无效，请重新登录。") from exc


async def verify_session(token: str) -> AuthIdentity:
    """Ask Supabase Auth to verify a JWT; cache only until its expiry or 60 seconds."""

    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise AuthFailure("登录服务尚未配置。", 503)
    expiry = _token_expiry(token)
    now = time()
    if expiry <= now:
        raise AuthFailure("登录已过期，请重新登录。")
    cached = _verified_tokens.get(token)
    if cached and cached[1] > now:
        return cached[0]

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        raise AuthFailure("暂时无法验证登录状态，请稍后重试。", 503) from exc
    if response.status_code != 200:
        raise AuthFailure("登录已失效，请重新登录。")
    try:
        user = response.json()
        user_id = str(UUID(user["id"]))
        email = str(user["email"])
        if not user.get("email_confirmed_at") or not email:
            raise AuthFailure("请先验证邮箱后再登录。", 403)
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthFailure("登录凭据无效，请重新登录。") from exc
    identity = AuthIdentity(user_id=user_id, email=email)
    if len(_verified_tokens) >= 2048:
        _verified_tokens.clear()
    _verified_tokens[token] = (identity, min(expiry, now + 60))
    return identity
