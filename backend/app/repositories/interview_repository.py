from __future__ import annotations

import json
import random

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import InterviewQuestion
from app.schemas import InterviewQuestionReviewUpdate, InterviewQuestionSeed
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


def _question_seed_payload(question: InterviewQuestion) -> dict[str, object]:
    return {
        "id": question.id,
        "domain": question.domain,
        "topic": question.topic,
        "subtopic": question.subtopic,
        "question": question.question,
        "difficulty": question.difficulty,
        "question_type": question.question_type,
        "expected_duration_seconds": question.expected_duration_seconds,
        "tags": question.tags,
        "reference_points": question.reference_points,
        "evaluation_rubric": question.evaluation_rubric,
        "common_mistakes": question.common_mistakes,
        "oral_answer_outline": question.oral_answer_outline,
        "reference_answer": question.reference_answer,
        "follow_up_questions": question.follow_up_questions,
        "sources": question.sources,
        "review_status": question.review_status,
        "verified_by_human": question.verified_by_human,
        "quality_score": question.quality_score,
    }


def apply_review_update(
    db: Session,
    question: InterviewQuestion,
    payload: InterviewQuestionReviewUpdate,
    *,
    verified_quality_threshold: float,
) -> InterviewQuestion:
    values = _question_seed_payload(question)
    updates = payload.model_dump(exclude_unset=True)
    values.update(updates)
    target_status = values["review_status"]
    values["verified_by_human"] = target_status == "verified"

    if target_status == "verified":
        quality_score = values.get("quality_score")
        if quality_score is None or float(quality_score) < verified_quality_threshold:
            raise ValueError(f"标记 verified 前 quality_score 必须不低于 {verified_quality_threshold:g}")
        if len(values["reference_points"]) < 3:
            raise ValueError("标记 verified 前至少需要 3 个 reference_points")
        if len(values["common_mistakes"]) < 2:
            raise ValueError("标记 verified 前至少需要 2 个 common_mistakes")
        if not str(values["reference_answer"]).strip():
            raise ValueError("标记 verified 前 reference_answer 不能为空")
        if not values["sources"]:
            raise ValueError("标记 verified 前至少需要一个来源")

    try:
        candidate = InterviewQuestionSeed(**values)
    except Exception as exc:
        raise ValueError(str(exc)) from exc

    next_hash = question_hash(candidate.question)
    conflict = db.scalar(
        select(InterviewQuestion).where(InterviewQuestion.question_hash == next_hash, InterviewQuestion.id != question.id)
    )
    if conflict is not None:
        raise ValueError(f"题目正文与 {conflict.id} 重复，不能保存")

    values_to_store = {
        "question": candidate.question,
        "question_hash": next_hash,
        "difficulty": candidate.difficulty,
        "expected_duration_seconds": candidate.expected_duration_seconds,
        "tags_json": json.dumps(candidate.tags, ensure_ascii=False),
        "reference_points_json": json.dumps(candidate.reference_points, ensure_ascii=False),
        "evaluation_rubric_json": json.dumps(
            [item.model_dump() for item in candidate.evaluation_rubric], ensure_ascii=False
        ),
        "common_mistakes_json": json.dumps(candidate.common_mistakes, ensure_ascii=False),
        "oral_answer_outline_json": json.dumps(candidate.oral_answer_outline, ensure_ascii=False),
        "reference_answer": candidate.reference_answer,
        "follow_up_questions_json": json.dumps(candidate.follow_up_questions, ensure_ascii=False),
        "review_status": candidate.review_status,
        "verified_by_human": candidate.verified_by_human,
        "quality_score": candidate.quality_score,
    }
    for name, value in values_to_store.items():
        setattr(question, name, value)
    db.commit()
    db.refresh(question)
    return question


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
