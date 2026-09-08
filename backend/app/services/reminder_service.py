from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Diary, PushSubscription
from app.schemas import PushSubscriptionCreate, PushSubscriptionUpdate
from app.services.algorithm_practice_service import algorithm_stats
from app.services.interview_training_service import get_training_stats
from app.time_utils import app_timezone


REMINDER_OPENERS = (
    "今天的小尾巴还在",
    "打卡簿轻轻敲门",
    "给今天留一个漂亮收尾",
    "趁记忆还热，再走一小步",
    "今晚的学习拼图还差几块",
    "别让今天空着回家",
    "今天还没结束，挑一件就好",
    "你的学习花园还有一点没浇水",
    "来领走今天剩下的经验值",
    "只做一项，也算把节奏接住",
    "睡前的小任务正在候场",
    "今天的进度条想再往前一点",
)


def upsert_subscription(db: Session, payload: PushSubscriptionCreate) -> PushSubscription:
    subscription = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if subscription is None:
        subscription = PushSubscription(endpoint=payload.endpoint, p256dh=payload.p256dh, auth=payload.auth)
        db.add(subscription)
    for field, value in payload.model_dump().items():
        setattr(subscription, field, value)
    db.commit()
    db.refresh(subscription)
    return subscription


def update_subscription(
    db: Session,
    subscription: PushSubscription,
    payload: PushSubscriptionUpdate,
) -> PushSubscription:
    for field, value in payload.model_dump().items():
        setattr(subscription, field, value)
    db.commit()
    db.refresh(subscription)
    return subscription


def subscription_is_due(subscription: PushSubscription, now: datetime) -> tuple[bool, str]:
    try:
        zone = ZoneInfo(subscription.timezone)
    except ZoneInfoNotFoundError:
        zone = app_timezone()
    local_now = now.astimezone(zone)
    date_key = local_now.date().isoformat()
    return (
        subscription.enabled
        and subscription.last_sent_local_date != date_key
        and local_now.strftime("%H:%M") >= subscription.reminder_time,
        date_key,
    )


def reminder_copy(subscription: PushSubscription, missing: list[str], date_key: str) -> tuple[str, str]:
    digest = hashlib.sha256(f"{date_key}:{subscription.endpoint}".encode()).digest()
    opener = REMINDER_OPENERS[int.from_bytes(digest[:2], "big") % len(REMINDER_OPENERS)]
    return opener, f"还差{'、'.join(missing)}。挑一个完成，今天就没有白过。"


def _missing_items(db: Session, subscription: PushSubscription, date_key: str) -> list[str]:
    algorithm = algorithm_stats(db)
    interview = get_training_stats(db)
    missing: list[str] = []
    if interview.today_answered_count < subscription.interview_goal:
        missing.append(f"八股 {subscription.interview_goal - interview.today_answered_count} 道")
    if algorithm.today_completed_count < subscription.algorithm_goal:
        missing.append(f"算法 {subscription.algorithm_goal - algorithm.today_completed_count} 道")
    if subscription.include_diary and db.scalar(select(Diary.id).where(Diary.date == date_key).limit(1)) is None:
        missing.append("一篇日记")
    due_count = algorithm.due_review_count + interview.due_review_count
    if subscription.include_review and due_count:
        missing.append(f"复习 {due_count} 项")
    return missing


def dispatch_due_reminders(db: Session, now: datetime | None = None) -> dict[str, int]:
    current = now or datetime.now(timezone.utc)
    subscriptions = list(db.scalars(select(PushSubscription).where(PushSubscription.enabled.is_(True))).all())
    result = {"checked": len(subscriptions), "sent": 0, "disabled": 0}
    if not settings.vapid_private_key or not settings.vapid_subject:
        return result

    for subscription in subscriptions:
        due, date_key = subscription_is_due(subscription, current)
        if not due:
            continue
        missing = _missing_items(db, subscription, date_key)
        subscription.last_sent_local_date = date_key
        if not missing:
            db.commit()
            continue
        title, body = reminder_copy(subscription, missing, date_key)
        payload = json.dumps({"title": title, "body": body, "url": "/today"}, ensure_ascii=False)
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=43_200,
            )
            result["sent"] += 1
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                subscription.enabled = False
                result["disabled"] += 1
            else:
                subscription.last_sent_local_date = None
        db.commit()
    return result
