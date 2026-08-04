from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import StudySession
from app.schemas import StudySessionAction, StudySessionCreate


ACTIVE_STATUSES = ("running", "paused")
MAX_SESSION_SECONDS = 86_400
MIN_TIMEZONE_OFFSET_MINUTES = -840
MAX_TIMEZONE_OFFSET_MINUTES = 840


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


def local_date_bounds(local_date: date, timezone_offset_minutes: int) -> tuple[datetime, datetime]:
    """Return a UTC [start, end) range for a client-local calendar date."""

    if not MIN_TIMEZONE_OFFSET_MINUTES <= timezone_offset_minutes <= MAX_TIMEZONE_OFFSET_MINUTES:
        raise StudySessionError("时区偏移必须在 -840 到 840 分钟之间")
    local_midnight_utc = datetime.combine(local_date, time.min, tzinfo=timezone.utc) - timedelta(
        minutes=timezone_offset_minutes
    )
    return local_midnight_utc, local_midnight_utc + timedelta(days=1)


def _default_local_date(now: datetime | None) -> date:
    return as_utc(now).date()


def list_today_sessions(
    db: Session,
    local_date: date | None = None,
    timezone_offset_minutes: int = 0,
    now: datetime | None = None,
    limit: int = 8,
) -> list[StudySession]:
    day_start, day_end = local_date_bounds(local_date or _default_local_date(now), timezone_offset_minutes)
    return list(
        db.scalars(
            select(StudySession)
            .where(
                StudySession.source == "desktop_pet",
                StudySession.started_at >= day_start,
                StudySession.started_at < day_end,
            )
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


def get_study_summary(
    db: Session,
    local_date: date | None = None,
    timezone_offset_minutes: int = 0,
    now: datetime | None = None,
) -> dict[str, object]:
    """Build the single source of truth used by the dashboard and diary UI."""

    current = as_utc(now)
    summary_date = local_date or current.date()
    day_start, day_end = local_date_bounds(summary_date, timezone_offset_minutes)
    source_filter = StudySession.source == "desktop_pet"
    today_filter = (source_filter, StudySession.started_at >= day_start, StudySession.started_at < day_end)

    today_sessions = list(
        db.scalars(select(StudySession).where(*today_filter).order_by(StudySession.updated_at.desc())).all()
    )
    today_accumulated = db.scalar(
        select(func.coalesce(func.sum(StudySession.accumulated_seconds), 0)).where(*today_filter)
    ) or 0
    today_running_extra = sum(
        current_elapsed_seconds(session, current) - session.accumulated_seconds
        for session in today_sessions
        if session.status == "running"
    )

    total_accumulated = db.scalar(
        select(func.coalesce(func.sum(StudySession.accumulated_seconds), 0)).where(source_filter)
    ) or 0
    running_sessions = list(
        db.scalars(select(StudySession).where(source_filter, StudySession.status == "running")).all()
    )
    total_running_extra = sum(
        current_elapsed_seconds(session, current) - session.accumulated_seconds for session in running_sessions
    )

    topics: dict[str, dict[str, object]] = defaultdict(dict)
    for session in today_sessions:
        title = session.title.strip()
        if not title:
            continue
        duration = current_elapsed_seconds(session, current)
        item = topics.get(title)
        if not item:
            topics[title] = {
                "title": title,
                "activity_type": session.activity_type,
                "study_seconds": duration,
                "updated_at": as_utc(session.updated_at),
            }
            continue
        item["study_seconds"] = int(item["study_seconds"]) + duration
        if as_utc(session.updated_at) > item["updated_at"]:
            item["activity_type"] = session.activity_type
            item["updated_at"] = as_utc(session.updated_at)

    sorted_topics = sorted(
        topics.values(),
        key=lambda item: (int(item["study_seconds"]), item["updated_at"]),
        reverse=True,
    )
    today_topics = [
        {
            "title": str(item["title"]),
            "activity_type": str(item["activity_type"]),
            "study_seconds": int(item["study_seconds"]),
        }
        for item in sorted_topics[:5]
    ]

    return {
        "date": summary_date.isoformat(),
        "today_study_seconds": int(today_accumulated) + today_running_extra,
        "total_study_seconds": int(total_accumulated) + total_running_extra,
        "today_session_count": len(today_sessions),
        "today_topic_count": len(topics),
        "today_topics": today_topics,
        "active_session": get_active_session(db),
        "recent_study_sessions": today_sessions[:5],
        "generated_at": current,
    }
