from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.llm import LLMError
from app.repositories import interview_training_repository as training_repository
from app.repositories.interview_repository import apply_review_update, get_question, list_questions
from app.schemas import (
    InterviewAnswerCreate,
    InterviewAnswerSubmissionRead,
    InterviewQuestionAIReviewBatchRequest,
    InterviewQuestionAIReviewRequest,
    InterviewQuestionAIReviewResult,
    InterviewQuestionBatchResult,
    InterviewQuestionIdsRequest,
    InterviewQuestionRead,
    InterviewQuestionReviewUpdate,
    InterviewQuestionSetCreate,
    InterviewQuestionSetRead,
    InterviewQuestionSetSummary,
    InterviewReviewScheduleRead,
)
from app.services.interview_question_review_service import (
    apply_ai_recommendation,
    batch_ai_review,
    batch_quick_publish,
    batch_reject,
    run_ai_review,
)
from app.services.interview_training_service import (
    create_question_set,
    get_question_set_read,
    list_due_reviews,
    list_question_set_summaries,
    retry_evaluation,
    skip_current_question,
    submit_and_evaluate,
)


router = APIRouter(prefix="/api/interviews", tags=["interviews"])
VERIFIED_QUALITY_THRESHOLD = 70.0


def require_question_review_enabled() -> None:
    if not settings.allow_question_review:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="题目审核接口尚未开启")


def require_unverified_access_enabled(review_status: str) -> None:
    if review_status != "verified" and not settings.allow_unverified_question_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="未审核题目访问尚未开启")


def require_ai_question_review_enabled() -> None:
    require_question_review_enabled()
    if not settings.allow_ai_question_review:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="AI 题目审核接口尚未开启")


def require_question_quick_publish_enabled() -> None:
    require_question_review_enabled()
    if not settings.allow_question_quick_publish:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="快速正式化接口尚未开启")


@router.get("/questions", response_model=list[InterviewQuestionRead])
def list_interview_questions(
    domain: Literal["agent", "rag", "llm_application", "python", "network", "ai_engineering"] | None = None,
    topic: str | None = None,
    difficulty: Literal["easy", "medium", "hard"] | None = None,
    count: int = Query(default=10, ge=1, le=100),
    review_status: Literal["pending", "verified", "rejected"] = "verified",
    random_order: bool = Query(default=False, alias="random"),
    db: Session = Depends(get_db),
) -> list[InterviewQuestionRead]:
    require_unverified_access_enabled(review_status)
    return list_questions(
        db,
        domain=domain,
        topic=topic.strip() if topic else None,
        difficulty=difficulty,
        review_status=review_status,
        random_order=random_order,
        count=count,
    )


@router.patch("/questions/{question_id}/review", response_model=InterviewQuestionRead)
def review_interview_question(
    question_id: str,
    payload: InterviewQuestionReviewUpdate,
    db: Session = Depends(get_db),
) -> InterviewQuestionRead:
    require_question_review_enabled()
    question = get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="八股题不存在")
    try:
        return apply_review_update(
            db,
            question,
            payload,
            verified_quality_threshold=VERIFIED_QUALITY_THRESHOLD,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.post("/questions/{question_id}/ai-review", response_model=InterviewQuestionAIReviewResult)
async def ai_review_interview_question(
    question_id: str,
    payload: InterviewQuestionAIReviewRequest,
    db: Session = Depends(get_db),
) -> InterviewQuestionAIReviewResult:
    require_ai_question_review_enabled()
    question = get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="八股题不存在")
    try:
        review, published = await run_ai_review(db, question, auto_publish=payload.auto_publish)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    return InterviewQuestionAIReviewResult(
        question=InterviewQuestionRead.model_validate(question),
        review=review,
        published=published,
        review_model=settings.llm_model,
    )


@router.post("/questions/{question_id}/ai-review/apply", response_model=InterviewQuestionAIReviewResult)
def apply_ai_interview_review(
    question_id: str,
    db: Session = Depends(get_db),
) -> InterviewQuestionAIReviewResult:
    require_ai_question_review_enabled()
    question = get_question(db, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="八股题不存在")
    try:
        review, published = apply_ai_recommendation(db, question)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    return InterviewQuestionAIReviewResult(
        question=InterviewQuestionRead.model_validate(question),
        review=review,
        published=published,
        review_model=question.review_model or settings.llm_model,
    )


@router.post("/questions/ai-review-batch", response_model=InterviewQuestionBatchResult)
async def ai_review_interview_questions_batch(
    payload: InterviewQuestionAIReviewBatchRequest,
    db: Session = Depends(get_db),
) -> InterviewQuestionBatchResult:
    require_ai_question_review_enabled()
    return await batch_ai_review(db, payload.question_ids, auto_publish=payload.auto_publish)


@router.post("/questions/publish-batch", response_model=InterviewQuestionBatchResult)
def quick_publish_interview_questions_batch(
    payload: InterviewQuestionIdsRequest,
    db: Session = Depends(get_db),
) -> InterviewQuestionBatchResult:
    require_question_quick_publish_enabled()
    return batch_quick_publish(db, payload.question_ids)


@router.post("/questions/reject-batch", response_model=InterviewQuestionBatchResult)
def reject_interview_questions_batch(
    payload: InterviewQuestionIdsRequest,
    db: Session = Depends(get_db),
) -> InterviewQuestionBatchResult:
    require_question_review_enabled()
    return batch_reject(db, payload.question_ids)


@router.get("/questions/{question_id}", response_model=InterviewQuestionRead)
def get_interview_question(
    question_id: str,
    review_status: Literal["pending", "verified", "rejected"] = "verified",
    db: Session = Depends(get_db),
) -> InterviewQuestionRead:
    require_unverified_access_enabled(review_status)
    question = get_question(db, question_id)
    if question is None or not question.is_active or question.review_status != review_status:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="八股题不存在或尚未通过审核")
    return question


@router.post("/question-sets", response_model=InterviewQuestionSetRead, status_code=status.HTTP_201_CREATED)
def create_interview_question_set(
    payload: InterviewQuestionSetCreate,
    db: Session = Depends(get_db),
) -> InterviewQuestionSetRead:
    try:
        question_set, message = create_question_set(db, payload)
        return get_question_set_read(db, question_set, message)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/question-sets", response_model=list[InterviewQuestionSetSummary])
def list_interview_question_sets(
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[InterviewQuestionSetSummary]:
    return list_question_set_summaries(db, limit)


@router.get("/question-sets/{question_set_id}", response_model=InterviewQuestionSetRead)
def get_interview_question_set(question_set_id: int, db: Session = Depends(get_db)) -> InterviewQuestionSetRead:
    question_set = training_repository.get_question_set(db, question_set_id)
    if question_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练题集不存在")
    return get_question_set_read(db, question_set)


@router.post("/question-sets/{question_set_id}/skip", response_model=InterviewQuestionSetRead)
def skip_interview_question(question_set_id: int, db: Session = Depends(get_db)) -> InterviewQuestionSetRead:
    question_set = training_repository.get_question_set(db, question_set_id)
    if question_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练题集不存在")
    try:
        updated = skip_current_question(db, question_set)
        return get_question_set_read(db, updated)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/question-sets/{question_set_id}/answers", response_model=InterviewAnswerSubmissionRead, status_code=status.HTTP_201_CREATED)
async def submit_interview_answer(
    question_set_id: int,
    payload: InterviewAnswerCreate,
    db: Session = Depends(get_db),
) -> InterviewAnswerSubmissionRead:
    question_set = training_repository.get_question_set(db, question_set_id)
    if question_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练题集不存在")
    try:
        return await submit_and_evaluate(db, question_set, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/answers/{answer_id}/retry", response_model=InterviewAnswerSubmissionRead, status_code=status.HTTP_201_CREATED)
async def retry_interview_answer(
    answer_id: int,
    payload: InterviewAnswerCreate,
    db: Session = Depends(get_db),
) -> InterviewAnswerSubmissionRead:
    previous_answer = training_repository.get_answer(db, answer_id)
    if previous_answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="回答不存在")
    if payload.question_id != previous_answer.question_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="重新回答不能更换题目")
    question_set = training_repository.get_question_set(db, previous_answer.question_set_id)
    if question_set is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练题集不存在")
    try:
        return await submit_and_evaluate(db, question_set, payload, retry=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/answers/{answer_id}/evaluate", response_model=InterviewAnswerSubmissionRead)
async def evaluate_saved_interview_answer(
    answer_id: int,
    db: Session = Depends(get_db),
) -> InterviewAnswerSubmissionRead:
    answer = training_repository.get_answer(db, answer_id)
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="回答不存在")
    return await retry_evaluation(db, answer)


@router.get("/reviews/due", response_model=list[InterviewReviewScheduleRead])
def get_due_interview_reviews(
    date: str | None = None,
    domain: Literal["agent", "rag", "llm_application", "python", "network", "ai_engineering"] | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[InterviewReviewScheduleRead]:
    try:
        return list_due_reviews(db, date=date, domain=domain, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
