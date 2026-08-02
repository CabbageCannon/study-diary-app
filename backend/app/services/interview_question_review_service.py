from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings
from app.llm import LLMError, review_interview_question
from app.models import InterviewQuestion, utc_now
from app.repositories.interview_repository import validate_question_for_publication
from app.schemas import (
    InterviewQuestionAIReview,
    InterviewQuestionBatchItemResult,
    InterviewQuestionBatchResult,
)


AI_AUTO_PUBLISH_THRESHOLD = 85


def can_auto_publish(question: InterviewQuestion, review: InterviewQuestionAIReview) -> bool:
    try:
        validate_question_for_publication(question)
    except ValueError:
        return False
    return (
        review.quality_score >= AI_AUTO_PUBLISH_THRESHOLD
        and review.recommended_status == "verified"
        and not review.factual_risk
        and not review.duplicate_risk
        and bool(question.sources)
    )


def _store_ai_review(question: InterviewQuestion, review: InterviewQuestionAIReview, raw_json: str) -> None:
    question.ai_quality_score = review.quality_score
    question.ai_review_json = raw_json
    question.review_model = settings.llm_model
    question.review_method = "ai_auto"
    question.reviewed_at = utc_now()


async def run_ai_review(
    db: Session,
    question: InterviewQuestion,
    *,
    auto_publish: bool,
) -> tuple[InterviewQuestionAIReview, bool]:
    if question.review_status == "verified" and question.verified_by_human:
        raise ValueError("人工精审已通过的题目默认不再执行 AI 审核")

    validate_question_for_publication(question)
    review, raw_json = await review_interview_question(question)
    _store_ai_review(question, review, raw_json)
    published = auto_publish and can_auto_publish(question, review)
    if published:
        question.review_status = "verified"
        question.review_method = "ai_auto"
        question.verified_by_human = False
    elif question.review_status != "verified":
        question.review_status = "pending"
        question.verified_by_human = False
    db.commit()
    db.refresh(question)
    return review, published


def apply_ai_recommendation(db: Session, question: InterviewQuestion) -> tuple[InterviewQuestionAIReview, bool]:
    if question.review_status == "verified" and question.verified_by_human:
        raise ValueError("人工精审已通过的题目不能被 AI 建议覆盖")
    if not question.ai_review:
        raise ValueError("当前题目还没有可采用的 AI 审核结果")

    review = InterviewQuestionAIReview.model_validate(question.ai_review)
    published = can_auto_publish(question, review)
    question.review_method = "ai_auto"
    question.reviewed_at = utc_now()
    if published:
        question.review_status = "verified"
        question.verified_by_human = False
    elif question.review_status != "verified":
        question.review_status = "pending"
        question.verified_by_human = False
    db.commit()
    db.refresh(question)
    return review, published


def quick_publish(db: Session, question: InterviewQuestion) -> InterviewQuestion:
    validate_question_for_publication(question)
    question.review_status = "verified"
    question.review_method = "manual_override"
    question.verified_by_human = False
    question.reviewed_at = utc_now()
    db.commit()
    db.refresh(question)
    return question


def reject_question(db: Session, question: InterviewQuestion) -> InterviewQuestion:
    question.review_status = "rejected"
    question.review_method = "human"
    question.verified_by_human = False
    question.reviewed_at = utc_now()
    db.commit()
    db.refresh(question)
    return question


async def batch_ai_review(
    db: Session,
    question_ids: list[str],
    *,
    auto_publish: bool,
) -> InterviewQuestionBatchResult:
    items: list[InterviewQuestionBatchItemResult] = []
    reviewed = published = kept_pending = failed = skipped = 0

    for question_id in question_ids:
        question = db.get(InterviewQuestion, question_id)
        if question is None:
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="题目不存在"))
            continue
        if question.review_status == "rejected":
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="rejected 题目默认跳过"))
            continue
        if question.review_status == "verified" and question.verified_by_human:
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="人工精审题目默认跳过"))
            continue
        try:
            review, was_published = await run_ai_review(db, question, auto_publish=auto_publish)
        except (LLMError, ValueError) as exc:
            db.rollback()
            failed += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="failed", message=str(exc)))
            continue
        except Exception as exc:  # Keep later questions runnable after an unexpected single-item failure.
            db.rollback()
            failed += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="failed", message=str(exc)))
            continue

        reviewed += 1
        if was_published:
            published += 1
            outcome = "published"
        else:
            kept_pending += 1
            outcome = "kept_pending"
        items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome=outcome, review=review))

    return InterviewQuestionBatchResult(
        total=len(question_ids),
        reviewed=reviewed,
        published=published,
        kept_pending=kept_pending,
        failed=failed,
        skipped=skipped,
        items=items,
    )


def batch_quick_publish(db: Session, question_ids: list[str]) -> InterviewQuestionBatchResult:
    items: list[InterviewQuestionBatchItemResult] = []
    published = failed = skipped = 0

    for question_id in question_ids:
        question = db.get(InterviewQuestion, question_id)
        if question is None:
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="题目不存在"))
            continue
        if question.review_status == "rejected":
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="rejected 题目默认跳过"))
            continue
        if question.review_status == "verified":
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="题目已经在正式训练池中"))
            continue
        try:
            quick_publish(db, question)
        except ValueError as exc:
            db.rollback()
            failed += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="failed", message=str(exc)))
            continue
        except Exception as exc:
            db.rollback()
            failed += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="failed", message=str(exc)))
            continue
        published += 1
        items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="published"))

    return InterviewQuestionBatchResult(
        total=len(question_ids),
        reviewed=0,
        published=published,
        kept_pending=0,
        failed=failed,
        skipped=skipped,
        items=items,
    )


def batch_reject(db: Session, question_ids: list[str]) -> InterviewQuestionBatchResult:
    items: list[InterviewQuestionBatchItemResult] = []
    reviewed = failed = skipped = 0

    for question_id in question_ids:
        question = db.get(InterviewQuestion, question_id)
        if question is None:
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="题目不存在"))
            continue
        if question.review_status == "rejected":
            skipped += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="skipped", message="题目已经被拒绝"))
            continue
        try:
            reject_question(db, question)
        except Exception as exc:  # Keep a single persistence failure from blocking later decisions.
            db.rollback()
            failed += 1
            items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="failed", message=str(exc)))
            continue
        reviewed += 1
        items.append(InterviewQuestionBatchItemResult(question_id=question_id, outcome="reviewed", message="已标记为 rejected"))

    return InterviewQuestionBatchResult(
        total=len(question_ids),
        reviewed=reviewed,
        published=0,
        kept_pending=0,
        failed=failed,
        skipped=skipped,
        items=items,
    )
