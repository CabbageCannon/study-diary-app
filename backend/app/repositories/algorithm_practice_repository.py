from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AlgorithmAttempt,
    AlgorithmPracticeSession,
    AlgorithmPracticeSessionItem,
    AlgorithmProblem,
    AlgorithmProblemProgress,
    AlgorithmReviewSchedule,
)


def get_problem(db: Session, problem_id: int) -> AlgorithmProblem | None:
    return db.get(AlgorithmProblem, problem_id)


def list_active_problems(db: Session) -> list[AlgorithmProblem]:
    return list(db.scalars(select(AlgorithmProblem).where(AlgorithmProblem.is_active.is_(True)).order_by(AlgorithmProblem.id)).all())


def get_session(db: Session, session_id: str, *, include_deleted: bool = False) -> AlgorithmPracticeSession | None:
    statement = select(AlgorithmPracticeSession).where(AlgorithmPracticeSession.id == session_id)
    if not include_deleted:
        statement = statement.where(AlgorithmPracticeSession.deleted_at.is_(None))
    return db.scalar(statement)


def list_session_items(db: Session, session_id: str) -> list[AlgorithmPracticeSessionItem]:
    return list(
        db.scalars(
            select(AlgorithmPracticeSessionItem)
            .where(AlgorithmPracticeSessionItem.session_id == session_id)
            .order_by(AlgorithmPracticeSessionItem.position)
        ).all()
    )


def get_session_item(db: Session, session_id: str, problem_id: int) -> AlgorithmPracticeSessionItem | None:
    return db.scalar(
        select(AlgorithmPracticeSessionItem).where(
            AlgorithmPracticeSessionItem.session_id == session_id,
            AlgorithmPracticeSessionItem.problem_id == problem_id,
        )
    )


def list_sessions(db: Session, *, status: str | None, limit: int) -> list[AlgorithmPracticeSession]:
    statement = select(AlgorithmPracticeSession).where(AlgorithmPracticeSession.deleted_at.is_(None))
    if status:
        statement = statement.where(AlgorithmPracticeSession.status == status)
    return list(db.scalars(statement.order_by(AlgorithmPracticeSession.last_active_at.desc()).limit(limit)).all())


def get_attempt(db: Session, attempt_id: int) -> AlgorithmAttempt | None:
    return db.get(AlgorithmAttempt, attempt_id)


def list_attempts(
    db: Session,
    *,
    problem_id: int | None = None,
    session_id: str | None = None,
    limit: int = 100,
) -> list[AlgorithmAttempt]:
    statement = select(AlgorithmAttempt)
    if problem_id is not None:
        statement = statement.where(AlgorithmAttempt.problem_id == problem_id)
    if session_id is not None:
        statement = statement.where(AlgorithmAttempt.session_id == session_id)
    return list(db.scalars(statement.order_by(AlgorithmAttempt.created_at.desc()).limit(limit)).all())


def latest_attempts_by_problem(db: Session, problem_ids: Iterable[int]) -> dict[int, AlgorithmAttempt]:
    ids = list(set(problem_ids))
    if not ids:
        return {}
    attempts = list(
        db.scalars(
            select(AlgorithmAttempt)
            .where(AlgorithmAttempt.problem_id.in_(ids))
            .order_by(AlgorithmAttempt.problem_id, AlgorithmAttempt.created_at.desc(), AlgorithmAttempt.id.desc())
        ).all()
    )
    latest: dict[int, AlgorithmAttempt] = {}
    for attempt in attempts:
        latest.setdefault(attempt.problem_id, attempt)
    return latest


def progress_by_problem(db: Session, problem_ids: Iterable[int]) -> dict[int, AlgorithmProblemProgress]:
    ids = list(set(problem_ids))
    if not ids:
        return {}
    records = list(db.scalars(select(AlgorithmProblemProgress).where(AlgorithmProblemProgress.problem_id.in_(ids))).all())
    return {record.problem_id: record for record in records}


def review_schedules_by_problem(db: Session, problem_ids: Iterable[int]) -> dict[int, AlgorithmReviewSchedule]:
    ids = list(set(problem_ids))
    if not ids:
        return {}
    records = list(db.scalars(select(AlgorithmReviewSchedule).where(AlgorithmReviewSchedule.problem_id.in_(ids))).all())
    return {record.problem_id: record for record in records}


def get_review_schedule(db: Session, problem_id: int) -> AlgorithmReviewSchedule | None:
    return db.scalar(select(AlgorithmReviewSchedule).where(AlgorithmReviewSchedule.problem_id == problem_id))
