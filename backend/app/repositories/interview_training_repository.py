from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import (
    InterviewAnswer,
    InterviewEvaluation,
    InterviewQuestion,
    InterviewQuestionSet,
    InterviewQuestionSetItem,
    InterviewReviewSchedule,
)


def list_verified_questions(
    db: Session,
    *,
    domain: str | None,
    topic: str | None,
    difficulty: str | None,
) -> list[InterviewQuestion]:
    statement: Select[tuple[InterviewQuestion]] = select(InterviewQuestion).where(
        InterviewQuestion.is_active.is_(True),
        InterviewQuestion.review_status == "verified",
    )
    if domain:
        statement = statement.where(InterviewQuestion.domain == domain)
    if topic:
        statement = statement.where(InterviewQuestion.topic == topic)
    if difficulty:
        statement = statement.where(InterviewQuestion.difficulty == difficulty)
    return list(db.scalars(statement.order_by(InterviewQuestion.id)).all())


def get_question_set(db: Session, question_set_id: int, user_id: str, *, include_deleted: bool = False) -> InterviewQuestionSet | None:
    question_set = db.scalar(select(InterviewQuestionSet).where(
        InterviewQuestionSet.id == question_set_id,
        InterviewQuestionSet.user_id == user_id,
    ))
    if question_set is None or (question_set.deleted_at is not None and not include_deleted):
        return None
    return question_set


def list_set_items(db: Session, question_set_id: int, user_id: str) -> list[InterviewQuestionSetItem]:
    statement = (
        select(InterviewQuestionSetItem)
        .join(InterviewQuestionSet, InterviewQuestionSet.id == InterviewQuestionSetItem.question_set_id)
        .where(
            InterviewQuestionSetItem.question_set_id == question_set_id,
            InterviewQuestionSet.user_id == user_id,
        )
    )
    return list(db.scalars(statement.order_by(InterviewQuestionSetItem.order_index)).all())


def get_set_item(db: Session, question_set_id: int, question_id: str, user_id: str) -> InterviewQuestionSetItem | None:
    return db.scalar(
        select(InterviewQuestionSetItem)
        .join(InterviewQuestionSet, InterviewQuestionSet.id == InterviewQuestionSetItem.question_set_id)
        .where(
            InterviewQuestionSetItem.question_set_id == question_set_id,
            InterviewQuestionSetItem.question_id == question_id,
            InterviewQuestionSet.user_id == user_id,
        )
    )


def list_answers_for_set(db: Session, question_set_id: int, user_id: str) -> list[InterviewAnswer]:
    statement = select(InterviewAnswer).where(
        InterviewAnswer.question_set_id == question_set_id,
        InterviewAnswer.user_id == user_id,
    )
    return list(db.scalars(statement.order_by(InterviewAnswer.question_id, InterviewAnswer.attempt_index)).all())


def get_answer(db: Session, answer_id: int, user_id: str) -> InterviewAnswer | None:
    return db.scalar(select(InterviewAnswer).where(InterviewAnswer.id == answer_id, InterviewAnswer.user_id == user_id))


def get_evaluation_for_answer(db: Session, answer_id: int, user_id: str) -> InterviewEvaluation | None:
    return db.scalar(
        select(InterviewEvaluation)
        .join(InterviewAnswer, InterviewAnswer.id == InterviewEvaluation.answer_id)
        .where(InterviewEvaluation.answer_id == answer_id, InterviewAnswer.user_id == user_id)
    )


def get_latest_answer_for_question_set(db: Session, question_set_id: int, question_id: str, user_id: str) -> InterviewAnswer | None:
    statement = (
        select(InterviewAnswer)
        .where(
            InterviewAnswer.question_set_id == question_set_id,
            InterviewAnswer.question_id == question_id,
            InterviewAnswer.user_id == user_id,
        )
        .order_by(InterviewAnswer.attempt_index.desc())
    )
    return db.scalar(statement)


def get_latest_answer_for_question(db: Session, question_id: str, user_id: str, *, excluding_question_set_id: int | None = None) -> InterviewAnswer | None:
    statement = select(InterviewAnswer).where(InterviewAnswer.question_id == question_id, InterviewAnswer.user_id == user_id)
    if excluding_question_set_id is not None:
        statement = statement.where(InterviewAnswer.question_set_id != excluding_question_set_id)
    return db.scalar(statement.order_by(InterviewAnswer.created_at.desc(), InterviewAnswer.attempt_index.desc()))


def get_latest_answer_times(db: Session, question_ids: list[str], user_id: str) -> dict[str, datetime]:
    if not question_ids:
        return {}
    statement = (
        select(InterviewAnswer.question_id, func.max(InterviewAnswer.created_at))
        .where(InterviewAnswer.question_id.in_(question_ids), InterviewAnswer.user_id == user_id)
        .group_by(InterviewAnswer.question_id)
    )
    return {question_id: created_at for question_id, created_at in db.execute(statement).all() if created_at is not None}


def get_question_last_seen_times(db: Session, question_ids: list[str], user_id: str) -> dict[str, datetime]:
    if not question_ids:
        return {}
    statement = (
        select(InterviewQuestionSetItem.question_id, func.max(InterviewQuestionSet.last_active_at))
        .join(InterviewQuestionSet, InterviewQuestionSet.id == InterviewQuestionSetItem.question_set_id)
        .where(
            InterviewQuestionSet.deleted_at.is_(None),
            InterviewQuestionSet.user_id == user_id,
            InterviewQuestionSetItem.question_id.in_(question_ids),
        )
        .group_by(InterviewQuestionSetItem.question_id)
    )
    return {question_id: last_seen for question_id, last_seen in db.execute(statement).all() if last_seen is not None}


def list_recent_question_set_ids(db: Session, limit: int, user_id: str) -> list[int]:
    statement = (
        select(InterviewQuestionSet.id)
        .where(InterviewQuestionSet.deleted_at.is_(None), InterviewQuestionSet.user_id == user_id)
        .order_by(InterviewQuestionSet.last_active_at.desc(), InterviewQuestionSet.id.desc())
        .limit(limit)
    )
    return list(db.scalars(statement).all())


def list_question_ids_for_sets(db: Session, question_set_ids: list[int], user_id: str) -> set[str]:
    if not question_set_ids:
        return set()
    statement = (
        select(InterviewQuestionSetItem.question_id)
        .join(InterviewQuestionSet, InterviewQuestionSet.id == InterviewQuestionSetItem.question_set_id)
        .where(
            InterviewQuestionSetItem.question_set_id.in_(question_set_ids),
            InterviewQuestionSet.user_id == user_id,
        )
    )
    return set(db.scalars(statement).all())


def get_schedules_for_questions(db: Session, question_ids: list[str], user_id: str) -> dict[str, InterviewReviewSchedule]:
    if not question_ids:
        return {}
    statement = select(InterviewReviewSchedule).where(
        InterviewReviewSchedule.question_id.in_(question_ids),
        InterviewReviewSchedule.user_id == user_id,
    )
    return {schedule.question_id: schedule for schedule in db.scalars(statement).all()}


def get_schedule(db: Session, question_id: str, user_id: str) -> InterviewReviewSchedule | None:
    return db.scalar(select(InterviewReviewSchedule).where(
        InterviewReviewSchedule.question_id == question_id,
        InterviewReviewSchedule.user_id == user_id,
    ))


def list_due_schedules(
    db: Session,
    user_id: str,
    *,
    due_before: datetime,
    domain: str | None,
    limit: int,
) -> list[tuple[InterviewReviewSchedule, InterviewQuestion]]:
    statement = (
        select(InterviewReviewSchedule, InterviewQuestion)
        .join(InterviewQuestion, InterviewQuestion.id == InterviewReviewSchedule.question_id)
        .where(
            InterviewReviewSchedule.next_review_at <= due_before,
            InterviewReviewSchedule.user_id == user_id,
            InterviewQuestion.is_active.is_(True),
            InterviewQuestion.review_status == "verified",
        )
        .order_by(InterviewReviewSchedule.next_review_at, InterviewReviewSchedule.id)
        .limit(limit)
    )
    if domain:
        statement = statement.where(InterviewQuestion.domain == domain)
    return list(db.execute(statement).all())


def list_question_sets(db: Session, limit: int, user_id: str, *, status: str | None = None) -> list[InterviewQuestionSet]:
    statement = select(InterviewQuestionSet).where(
        InterviewQuestionSet.deleted_at.is_(None),
        InterviewQuestionSet.user_id == user_id,
    )
    if status:
        statement = statement.where(InterviewQuestionSet.status == status)
    statement = statement.order_by(InterviewQuestionSet.last_active_at.desc(), InterviewQuestionSet.id.desc()).limit(limit)
    return list(db.scalars(statement).all())


def list_question_sets_for_stats(db: Session, user_id: str) -> list[InterviewQuestionSet]:
    return list(
        db.scalars(
            select(InterviewQuestionSet)
            .where(InterviewQuestionSet.deleted_at.is_(None), InterviewQuestionSet.user_id == user_id)
            .order_by(InterviewQuestionSet.last_active_at.desc(), InterviewQuestionSet.id.desc())
        ).all()
    )
