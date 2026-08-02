from __future__ import annotations

import json
import random

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import InterviewQuestion
from app.schemas import InterviewQuestionSeed
from app.services.interview_bank_service import question_hash


def list_questions(
    db: Session,
    *,
    domain: str | None,
    topic: str | None,
    difficulty: str | None,
    review_status: str,
    random_order: bool,
    count: int,
) -> list[InterviewQuestion]:
    statement: Select[tuple[InterviewQuestion]] = select(InterviewQuestion).where(
        InterviewQuestion.is_active.is_(True), InterviewQuestion.review_status == review_status
    )
    if domain:
        statement = statement.where(InterviewQuestion.domain == domain)
    if topic:
        statement = statement.where(InterviewQuestion.topic == topic)
    if difficulty:
        statement = statement.where(InterviewQuestion.difficulty == difficulty)
    questions = list(db.scalars(statement.order_by(InterviewQuestion.id)).all())
    if random_order:
        random.SystemRandom().shuffle(questions)
    return questions[:count]


def get_question(db: Session, question_id: str) -> InterviewQuestion | None:
    return db.get(InterviewQuestion, question_id)


def upsert_question(db: Session, payload: InterviewQuestionSeed) -> tuple[InterviewQuestion, str]:
    question = db.get(InterviewQuestion, payload.id)
    values = {
        "domain": payload.domain,
        "topic": payload.topic,
        "subtopic": payload.subtopic,
        "question": payload.question,
        "question_hash": question_hash(payload.question),
        "difficulty": payload.difficulty,
        "question_type": payload.question_type,
        "expected_duration_seconds": payload.expected_duration_seconds,
        "tags_json": json.dumps(payload.tags, ensure_ascii=False),
        "reference_points_json": json.dumps(payload.reference_points, ensure_ascii=False),
        "evaluation_rubric_json": json.dumps(
            [item.model_dump() for item in payload.evaluation_rubric], ensure_ascii=False
        ),
        "common_mistakes_json": json.dumps(payload.common_mistakes, ensure_ascii=False),
        "oral_answer_outline_json": json.dumps(payload.oral_answer_outline, ensure_ascii=False),
        "reference_answer": payload.reference_answer,
        "follow_up_questions_json": json.dumps(payload.follow_up_questions, ensure_ascii=False),
        "sources_json": json.dumps([item.model_dump(exclude_none=True) for item in payload.sources], ensure_ascii=False),
        "review_status": payload.review_status,
        "verified_by_human": payload.verified_by_human,
        "quality_score": payload.quality_score,
        "is_active": True,
    }
    if question is None:
        question = InterviewQuestion(id=payload.id, **values)
        db.add(question)
        return question, "created"
    changed = any(getattr(question, name) != value for name, value in values.items())
    if not changed:
        return question, "skipped"
    for name, value in values.items():
        setattr(question, name, value)
    return question, "updated"
