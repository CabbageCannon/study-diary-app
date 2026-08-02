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


def get_question_set(db: Session, question_set_id: int) -> InterviewQuestionSet | None:
    return db.get(InterviewQuestionSet, question_set_id)


def list_set_items(db: Session, question_set_id: int) -> list[InterviewQuestionSetItem]:
    statement = select(InterviewQuestionSetItem).where(InterviewQuestionSetItem.question_set_id == question_set_id)
    return list(db.scalars(statement.order_by(InterviewQuestionSetItem.order_index)).all())


def get_set_item(db: Session, question_set_id: int, question_id: str) -> InterviewQuestionSetItem | None:
    return db.scalar(
        select(InterviewQuestionSetItem).where(
            InterviewQuestionSetItem.question_set_id == question_set_id,
            InterviewQuestionSetItem.question_id == question_id,
        )
    )


def list_answers_for_set(db: Session, question_set_id: int) -> list[InterviewAnswer]:
    statement = select(InterviewAnswer).where(InterviewAnswer.question_set_id == question_set_id)
    return list(db.scalars(statement.order_by(InterviewAnswer.question_id, InterviewAnswer.attempt_index)).all())


def get_answer(db: Session, answer_id: int) -> InterviewAnswer | None:
    return db.get(InterviewAnswer, answer_id)


def get_evaluation_for_answer(db: Session, answer_id: int) -> InterviewEvaluation | None:
    return db.scalar(select(InterviewEvaluation).where(InterviewEvaluation.answer_id == answer_id))


def get_latest_answer_for_question_set(db: Session, question_set_id: int, question_id: str) -> InterviewAnswer | None:
    statement = (
        select(InterviewAnswer)
        .where(InterviewAnswer.question_set_id == question_set_id, InterviewAnswer.question_id == question_id)
        .order_by(InterviewAnswer.attempt_index.desc())
    )
    return db.scalar(statement)


def get_latest_answer_times(db: Session, question_ids: list[str]) -> dict[str, datetime]:
    if not question_ids:
        return {}
    statement = (
        select(InterviewAnswer.question_id, func.max(InterviewAnswer.created_at))
        .where(InterviewAnswer.question_id.in_(question_ids))
        .group_by(InterviewAnswer.question_id)
    )
    return {question_id: created_at for question_id, created_at in db.execute(statement).all() if created_at is not None}


def get_schedules_for_questions(db: Session, question_ids: list[str]) -> dict[str, InterviewReviewSchedule]:
    if not question_ids:
        return {}
    statement = select(InterviewReviewSchedule).where(InterviewReviewSchedule.question_id.in_(question_ids))
    return {schedule.question_id: schedule for schedule in db.scalars(statement).all()}


def get_schedule(db: Session, question_id: str) -> InterviewReviewSchedule | None:
    return db.scalar(select(InterviewReviewSchedule).where(InterviewReviewSchedule.question_id == question_id))


def list_due_schedules(
    db: Session,
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
            InterviewQuestion.is_active.is_(True),
            InterviewQuestion.review_status == "verified",
        )
        .order_by(InterviewReviewSchedule.next_review_at, InterviewReviewSchedule.id)
        .limit(limit)
    )
    if domain:
        statement = statement.where(InterviewQuestion.domain == domain)
    return list(db.execute(statement).all())


def list_question_sets(db: Session, limit: int) -> list[InterviewQuestionSet]:
    statement = select(InterviewQuestionSet).order_by(InterviewQuestionSet.created_at.desc()).limit(limit)
    return list(db.scalars(statement).all())
