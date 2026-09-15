from hmac import compare_digest

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import PushSubscription
from app.schemas import (
    PushPublicKeyRead,
    PushSubscriptionCreate,
    PushSubscriptionRead,
    PushSubscriptionUpdate,
    ReminderDispatchRead,
)
from app.services.reminder_service import dispatch_due_reminders, update_subscription, upsert_subscription


router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("/public-key", response_model=PushPublicKeyRead)
def get_public_key() -> PushPublicKeyRead:
    if not settings.vapid_public_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="提醒服务尚未配置")
    return PushPublicKeyRead(public_key=settings.vapid_public_key)


@router.post("/subscriptions", response_model=PushSubscriptionRead, status_code=status.HTTP_201_CREATED)
def create_subscription(
    payload: PushSubscriptionCreate,
    db: Session = Depends(get_db),
) -> PushSubscription:
    return upsert_subscription(db, payload)


@router.patch("/subscriptions/{subscription_id}", response_model=PushSubscriptionRead)
def patch_subscription(
    subscription_id: int,
    payload: PushSubscriptionUpdate,
    db: Session = Depends(get_db),
) -> PushSubscription:
    subscription = db.get(PushSubscription, subscription_id)
    if subscription is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提醒订阅不存在")
    return update_subscription(db, subscription, payload)


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(subscription_id: int, db: Session = Depends(get_db)) -> Response:
    subscription = db.get(PushSubscription, subscription_id)
    if subscription is not None:
        db.delete(subscription)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/dispatch", response_model=ReminderDispatchRead)
def dispatch_reminders(
    x_reminder_cron: str = Header(default=""),
    db: Session = Depends(get_db),
) -> ReminderDispatchRead:
    if not settings.reminder_cron_secret or not compare_digest(x_reminder_cron, settings.reminder_cron_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的提醒调度凭据")
    return ReminderDispatchRead(**dispatch_due_reminders(db))
