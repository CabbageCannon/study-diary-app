"""Application preferences and account administration."""

from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import UserProfile


router = APIRouter(prefix="/api", tags=["accounts"])


class DailyGoals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    interview: int = Field(ge=0, le=30)
    algorithm: int = Field(ge=0, le=30)
    diary: int = Field(ge=0, le=30)
    review: int = Field(ge=0, le=30)


class ReminderPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    time: str
    subscriptionId: int | None = Field(default=None, ge=1)

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        try:
            datetime.strptime(value, "%H:%M")
        except ValueError as exc:
            raise ValueError("提醒时间须为 HH:MM") from exc
        return value


class UserPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str = Field(max_length=80)
    targetRole: str = Field(max_length=160)
    learningStyle: str = Field(max_length=240)
    dailyGoals: DailyGoals
    reminder: ReminderPreferences
    theme: str = Field(pattern="^(mist|clay|night|frost)$")


class UserStatusUpdate(BaseModel):
    active: bool


def _profile_read(profile: UserProfile) -> dict[str, object]:
    return {
        "id": profile.id,
        "email": profile.email,
        "role": profile.role,
        "active": profile.active,
        "preferences": profile.preferences,
    }


def _require_admin(request: Request) -> None:
    if not request.state.is_admin:
        raise HTTPException(status_code=403, detail="仅管理员可以管理用户。")


def _auth_users() -> list[dict[str, object]]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="用户管理服务尚未配置。")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    users: list[dict[str, object]] = []
    try:
        with httpx.Client(timeout=10.0) as client:
            for page in range(1, 101):
                response = client.get(
                    f"{settings.supabase_url}/auth/v1/admin/users",
                    params={"page": page, "per_page": 1000},
                    headers=headers,
                )
                response.raise_for_status()
                batch = response.json().get("users", [])
                if not isinstance(batch, list):
                    raise ValueError("无效的用户列表响应")
                users.extend(batch)
                if len(batch) < 1000:
                    break
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="暂时无法读取用户列表。") from exc
    return users


def _admin_user(user: dict[str, object], profile: UserProfile | None) -> dict[str, object]:
    user_id = str(user["id"])
    return {
        "id": user_id,
        "email": str(user.get("email") or ""),
        "role": "admin" if user_id == settings.admin_user_id else "user",
        "active": profile.active if profile else True,
        "created_at": str(user.get("created_at") or ""),
    }


@router.get("/me")
def get_me(request: Request, db: Session = Depends(get_db)) -> dict[str, object]:
    return _profile_read(db.get(UserProfile, request.state.user_id))


@router.patch("/me/preferences")
def update_me_preferences(
    payload: UserPreferences,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    profile = db.get(UserProfile, request.state.user_id)
    profile.preferences_json = json.dumps(payload.model_dump(), ensure_ascii=False)
    db.commit()
    db.refresh(profile)
    return _profile_read(profile)


@router.get("/admin/users")
def list_users(request: Request, db: Session = Depends(get_db)) -> list[dict[str, object]]:
    _require_admin(request)
    users = _auth_users()
    profiles = {profile.id: profile for profile in db.query(UserProfile).all()}
    return [_admin_user(user, profiles.get(str(user["id"]))) for user in users]


@router.patch("/admin/users/{user_id}/status")
def update_user_status(
    user_id: str,
    payload: UserStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _require_admin(request)
    try:
        user_id = str(UUID(user_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="用户不存在。") from exc
    if user_id == settings.admin_user_id:
        raise HTTPException(status_code=400, detail="不能停用管理员账户。")
    user = next((item for item in _auth_users() if str(item.get("id")) == user_id), None)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在。")
    profile = db.get(UserProfile, user_id)
    if profile is None:
        profile = UserProfile(id=user_id, email=str(user.get("email") or ""))
        db.add(profile)
    profile.active = payload.active
    db.commit()
    return _admin_user(user, profile)
