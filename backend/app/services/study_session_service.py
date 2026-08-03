from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StudySession
from app.schemas import StudySessionAction, StudySessionCreate


ACTIVE_STATUSES = ("running", "paused")
MAX_SESSION_SECONDS = 86_400


class StudySessionError(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None, default: datetime | None = None) -> datetime:
    result = value or default or utc_now()
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)


def _validate_client_time(value: datetime | None) -> datetime:
    result = as_utc(value)
    if result > utc_now().replace(microsecond=0) and (result - utc_now()).total_seconds() > 300:
        raise StudySessionError("学习时间不能超过当前时间五分钟")
    return result


def create_session(db: Session, payload: StudySessionCreate) -> tuple[StudySession, bool]:
    existing = db.scalar(select(StudySession).where(StudySession.client_event_id == payload.client_event_id))
    if existing:
        return existing, False

    active = db.scalar(
        select(StudySession)
        .where(StudySession.source == payload.source, StudySession.status.in_(ACTIVE_STATUSES))
        .order_by(StudySession.updated_at.desc())
    )
    if active:
        raise StudySessionError("已有进行中的学习会话，请先暂停、完成或恢复该会话")

    started_at = _validate_client_time(payload.started_at)
    session = StudySession(
        id=str(uuid4()),
        client_event_id=payload.client_event_id,
        source=payload.source,
        activity_type=payload.activity_type,
        title=payload.title,
        status="running",
        started_at=started_at,
        last_resumed_at=started_at,
        accumulated_seconds=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, True


def get_active_session(db: Session) -> StudySession | None:
    return db.scalar(
        select(StudySession)
        .where(StudySession.source == "desktop_pet", StudySession.status.in_(ACTIVE_STATUSES))
        .order_by(StudySession.updated_at.desc())
    )


def _get_session(db: Session, session_id: str) -> StudySession:
    session = db.get(StudySession, session_id)
    if not session or session.source != "desktop_pet":
        raise StudySessionError("未找到学习会话")
    return session


def _apply_elapsed(session: StudySession, payload: StudySessionAction) -> None:
    if payload.accumulated_seconds < session.accumulated_seconds:
        raise StudySessionError("学习时长不能倒退")
    if payload.accumulated_seconds > MAX_SESSION_SECONDS:
        raise StudySessionError("单次学习时长不能超过 24 小时")
    session.accumulated_seconds = payload.accumulated_seconds


def pause_session(db: Session, session_id: str, payload: StudySessionAction) -> StudySession:
    session = _get_session(db, session_id)
    if session.status == "completed":
        return session
    if session.status == "paused":
        return session
    _apply_elapsed(session, payload)
    session.status = "paused"
    session.paused_at = _validate_client_time(payload.occurred_at)
    session.last_resumed_at = None
    db.commit()
    db.refresh(session)
    return session


def resume_session(db: Session, session_id: str, payload: StudySessionAction) -> StudySession:
    session = _get_session(db, session_id)
    if session.status == "completed":
        return session
    if session.status == "running":
        return session
    _apply_elapsed(session, payload)
    session.status = "running"
    session.paused_at = None
    session.last_resumed_at = _validate_client_time(payload.occurred_at)
    db.commit()
    db.refresh(session)
    return session


def complete_session(db: Session, session_id: str, payload: StudySessionAction) -> StudySession:
    session = _get_session(db, session_id)
    if session.status == "completed":
        return session
    _apply_elapsed(session, payload)
    session.status = "completed"
    session.completed_at = _validate_client_time(payload.occurred_at)
    session.last_resumed_at = None
    session.paused_at = None
    db.commit()
    db.refresh(session)
    return session


def abandon_session(db: Session, session_id: str, payload: StudySessionAction) -> StudySession:
    session = _get_session(db, session_id)
    if session.status in {"completed", "abandoned"}:
        return session
    _apply_elapsed(session, payload)
    session.status = "abandoned"
    session.last_resumed_at = None
    session.paused_at = _validate_client_time(payload.occurred_at)
    db.commit()
    db.refresh(session)
    return session


def list_today_sessions(db: Session, now: datetime | None = None, limit: int = 8) -> list[StudySession]:
    current = as_utc(now)
    day_start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    return list(
        db.scalars(
            select(StudySession)
            .where(StudySession.source == "desktop_pet", StudySession.started_at >= day_start)
            .order_by(StudySession.updated_at.desc())
            .limit(limit)
        ).all()
    )


def current_elapsed_seconds(session: StudySession, now: datetime | None = None) -> int:
    if session.status != "running" or not session.last_resumed_at:
        return session.accumulated_seconds
    started = as_utc(session.last_resumed_at)
    elapsed = max(0, int((as_utc(now) - started).total_seconds()))
    return min(MAX_SESSION_SECONDS, session.accumulated_seconds + elapsed)
