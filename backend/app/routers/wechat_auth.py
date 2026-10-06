"""WeChat Mini Program login and existing-account binding endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthIdentity, issue_miniapp_token
from app.database import get_db
from app.services.wechat_auth_service import bind_openid, exchange_login_code, login_or_create


router = APIRouter(prefix="/api/auth/wechat", tags=["wechat-auth"])


class WechatCodePayload(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    create: bool = False


def _token_response(identity: AuthIdentity) -> dict[str, object]:
    token, expires_in = issue_miniapp_token(identity)
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in}


@router.post("/login")
async def login(payload: WechatCodePayload, db: Session = Depends(get_db)) -> dict[str, object]:
    openid, unionid = await exchange_login_code(payload.code)
    identity = login_or_create(db, openid, unionid, payload.create)
    if identity is None:
        raise HTTPException(
            status_code=409,
            detail={"code": "WECHAT_NOT_BOUND", "message": "请先绑定已有学习账户，或选择创建新账户。"},
        )
    return _token_response(identity)


@router.post("/bind")
async def bind(payload: WechatCodePayload, request: Request, db: Session = Depends(get_db)) -> dict[str, object]:
    openid, unionid = await exchange_login_code(payload.code)
    identity = bind_openid(db, openid, unionid, request.state.user_id)
    return _token_response(identity)
