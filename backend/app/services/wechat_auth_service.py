"""Server-side WeChat Mini Program identity exchange.

The Mini Program sends only a short-lived ``wx.login`` code.  AppSecret,
OpenID and session_key never leave this module as API responses.
"""

from __future__ import annotations

from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import AuthIdentity
from app.config import settings
from app.models import UserProfile, WechatMiniIdentity


WECHAT_SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session"


async def exchange_login_code(code: str) -> tuple[str, str | None]:
    if not settings.wechat_mini_app_id or not settings.wechat_mini_app_secret:
        raise HTTPException(status_code=503, detail="微信小程序登录尚未配置。")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                WECHAT_SESSION_URL,
                params={
                    "appid": settings.wechat_mini_app_id,
                    "secret": settings.wechat_mini_app_secret,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="暂时无法连接微信登录服务，请稍后重试。") from exc
    openid = payload.get("openid")
    if not isinstance(openid, str) or not openid:
        message = str(payload.get("errmsg") or "微信登录凭据已失效，请重试。")
        raise HTTPException(status_code=401, detail=message)
    unionid = payload.get("unionid")
    return openid, str(unionid) if isinstance(unionid, str) and unionid else None


def login_or_create(db: Session, openid: str, unionid: str | None, create: bool) -> AuthIdentity | None:
    identity = db.get(WechatMiniIdentity, openid)
    if identity is None:
        if not create:
            return None
        user_id = str(uuid4())
        # The address is an internal non-deliverable identifier. Never treat it
        # as a login email or expose it as a contact method in the mini app.
        profile = UserProfile(id=user_id, email=f"wechat-{user_id}@local.invalid", active=True)
        identity = WechatMiniIdentity(openid=openid, user_id=user_id, unionid=unionid)
        db.add_all([profile, identity])
        db.commit()
        return AuthIdentity(user_id=user_id, email=profile.email)
    if unionid and identity.unionid != unionid:
        identity.unionid = unionid
        db.commit()
    profile = db.get(UserProfile, identity.user_id)
    if profile is None:
        raise HTTPException(status_code=409, detail="微信账户关联异常，请联系管理员。")
    return AuthIdentity(user_id=profile.id, email=profile.email)


def bind_openid(db: Session, openid: str, unionid: str | None, user_id: str) -> AuthIdentity:
    identity = db.get(WechatMiniIdentity, openid)
    if identity is not None and identity.user_id != user_id:
        raise HTTPException(status_code=409, detail="该微信已绑定其他学习账户。")
    if identity is None:
        identity = WechatMiniIdentity(openid=openid, user_id=user_id, unionid=unionid)
        db.add(identity)
    elif unionid and identity.unionid != unionid:
        identity.unionid = unionid
    profile = db.get(UserProfile, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="学习账户不存在，请重新登录。")
    db.commit()
    return AuthIdentity(user_id=profile.id, email=profile.email)
