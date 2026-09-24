from datetime import date as date_type
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm import LLMError, generate_algorithm_hint
from app.repositories.algorithm_practice_repository import get_problem, list_attempts
from app.repositories.algorithm_repository import get_by_identifier
from app.schemas import (
    AlgorithmAttemptCreate,
    AlgorithmAttemptRead,
    AlgorithmAttemptUpdate,
    AlgorithmCatalogOverviewRead,
    AlgorithmDailyFeedRead,
    AlgorithmDailyRecommendationSettingsRead,
    AlgorithmDailyRecommendationSettingsUpdate,
    AlgorithmHintRead,
    AlgorithmHintRequest,
    AlgorithmPracticeSessionCreate,
    AlgorithmPracticeSessionProgressUpdate,
    AlgorithmPracticeSessionRead,
    AlgorithmPracticeSessionSummary,
    AlgorithmProblemHintRequest,
    AlgorithmProblemRead,
    AlgorithmProblemReasoningContextResponse,
    AlgorithmReasoningAnswerCreate,
    AlgorithmReasoningAnswerDetailRead,
    AlgorithmReasoningCheckCreate,
    AlgorithmReasoningCheckResponse,
    AlgorithmReasoningRecheckRequest,
    AlgorithmReviewCandidateRead,
    AlgorithmReviewScheduleRead,
    AlgorithmReviewSessionCreate,
    AlgorithmStatsRead,
    AlgorithmWeaknessRead,
)
from app.services.algorithm_reasoning_service import (
    AlgorithmReasoningConflict,
    AlgorithmReasoningError,
    AlgorithmReasoningNotFound,
    get_answer_detail,
    get_problem_reasoning_context,
    list_reasoning_answers,
    save_and_check_reasoning_answer,
    save_reasoning_answer,
    check_saved_reasoning_answer,
)
from app.services.algorithm_practice_service import (
    AlgorithmPracticeError,
    algorithm_catalog_overview,
    algorithm_stats,
    algorithm_weaknesses,
    create_attempt,
    create_review_session,
    create_session,
    daily_problem,
    delete_attempt,
    delete_session,
    due_reviews,
    finish_session,
    get_attempt_read,
    get_daily_feed,
    get_daily_settings,
    get_session_read,
    list_review_candidates,
    list_session_summaries,
    list_catalog_problems,
    mark_ai_review_failed,
    request_ai_review,
    request_hint,
    refresh_daily_feed,
    similar_problems,
    skip_session_problem,
    update_attempt,
    update_daily_settings,
    update_session_progress,
)


router = APIRouter(prefix="/api/algorithms", tags=["algorithms"])


def _domain_error(exc: AlgorithmPracticeError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


def _reasoning_error(exc: AlgorithmReasoningError) -> HTTPException:
    if isinstance(exc, AlgorithmReasoningNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, AlgorithmReasoningConflict):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


def _save_failed_response(exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "save_status": "save_failed",
            "check_status": "not_attempted",
            "answer": None,
            "feedback": None,
            "save_error": "回答保存失败，请检查题目、回答内容和 client_answer_id。",
            "check_error": None,
            "retry": None,
            "problem_context": None,
            "detail": str(exc),
        },
    )


@router.get("/problems", response_model=list[AlgorithmProblemRead])
def list_algorithm_problems(
    request: Request,
    difficulty: Literal["easy", "medium", "hard"] | None = None,
    pattern: str | None = None,
    topic: str | None = None,
    source_list: str | None = None,
    exclude_completed: bool = False,
    search: str | None = None,
    completed: bool | None = None,
    needs_review: bool | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlgorithmProblemRead]:
    return list_catalog_problems(
        db,
        request.state.user_id,
        difficulty=difficulty,
        pattern=pattern.strip() if pattern else None,
        topic=topic.strip() if topic else None,
        source_list=source_list.strip() if source_list else None,
        search=search,
        completed=False if exclude_completed else completed,
        needs_review=needs_review,
        limit=limit,
    )


@router.get("/daily", response_model=AlgorithmProblemRead)
def get_daily_problem(request: Request, db: Session = Depends(get_db)) -> AlgorithmProblemRead:
    try:
        return daily_problem(db, request.state.user_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/daily-feed", response_model=AlgorithmDailyFeedRead)
def get_algorithm_daily_feed(request: Request, db: Session = Depends(get_db)) -> AlgorithmDailyFeedRead:
    try:
        return get_daily_feed(db, request.state.user_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/daily-feed/refresh", response_model=AlgorithmDailyFeedRead)
def refresh_algorithm_daily_feed(request: Request, db: Session = Depends(get_db)) -> AlgorithmDailyFeedRead:
    try:
        return refresh_daily_feed(db, request.state.user_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/daily-settings", response_model=AlgorithmDailyRecommendationSettingsRead)
def get_algorithm_daily_settings(request: Request, db: Session = Depends(get_db)) -> AlgorithmDailyRecommendationSettingsRead:
    return get_daily_settings(db, request.state.user_id)


@router.patch("/daily-settings", response_model=AlgorithmDailyRecommendationSettingsRead)
def patch_algorithm_daily_settings(
    payload: AlgorithmDailyRecommendationSettingsUpdate, request: Request, db: Session = Depends(get_db)
) -> AlgorithmDailyRecommendationSettingsRead:
    return update_daily_settings(db, request.state.user_id, payload)


@router.get("/catalog-overview", response_model=AlgorithmCatalogOverviewRead)
def get_algorithm_catalog_overview(request: Request, db: Session = Depends(get_db)) -> AlgorithmCatalogOverviewRead:
    return algorithm_catalog_overview(db, request.state.user_id)


@router.post("/sessions", response_model=AlgorithmPracticeSessionRead, status_code=status.HTTP_201_CREATED)
def create_algorithm_session(
    payload: AlgorithmPracticeSessionCreate, request: Request, db: Session = Depends(get_db)
) -> AlgorithmPracticeSessionRead:
    try:
        return create_session(db, request.state.user_id, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/sessions", response_model=list[AlgorithmPracticeSessionSummary])
def list_algorithm_sessions(
    request: Request,
    status_filter: Literal["in_progress", "completed", "abandoned"] | None = Query(default=None, alias="status"),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlgorithmPracticeSessionSummary]:
    return list_session_summaries(db, request.state.user_id, status=status_filter, limit=limit)


@router.get("/sessions/{session_id}", response_model=AlgorithmPracticeSessionRead)
def get_algorithm_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return get_session_read(db, request.state.user_id, session_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/sessions/{session_id}/progress", response_model=AlgorithmPracticeSessionRead)
def update_algorithm_session_progress(
    session_id: str, payload: AlgorithmPracticeSessionProgressUpdate, request: Request, db: Session = Depends(get_db)
) -> AlgorithmPracticeSessionRead:
    try:
        return update_session_progress(db, request.state.user_id, session_id, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/skip", response_model=AlgorithmPracticeSessionRead)
def skip_algorithm_session_problem(session_id: str, request: Request, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return skip_session_problem(db, request.state.user_id, session_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/complete", response_model=AlgorithmPracticeSessionRead)
def complete_algorithm_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return finish_session(db, request.state.user_id, session_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/abandon", response_model=AlgorithmPracticeSessionRead)
def abandon_algorithm_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return finish_session(db, request.state.user_id, session_id, abandoned=True)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_algorithm_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    try:
        delete_session(db, request.state.user_id, session_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/attempts", response_model=AlgorithmAttemptRead, status_code=status.HTTP_201_CREATED)
def save_algorithm_attempt(payload: AlgorithmAttemptCreate, request: Request, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return create_attempt(db, request.state.user_id, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/attempts", response_model=list[AlgorithmAttemptRead])
def list_algorithm_attempts(
    request: Request,
    problem_id: int | None = None,
    session_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[AlgorithmAttemptRead]:
    return [AlgorithmAttemptRead.model_validate(attempt) for attempt in list_attempts(db, request.state.user_id, problem_id=problem_id, session_id=session_id, limit=limit)]


@router.get("/attempts/{attempt_id}", response_model=AlgorithmAttemptRead)
def get_algorithm_attempt(attempt_id: int, request: Request, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return get_attempt_read(db, request.state.user_id, attempt_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/attempts/{attempt_id}", response_model=AlgorithmAttemptRead)
def patch_algorithm_attempt(
    attempt_id: int, payload: AlgorithmAttemptUpdate, request: Request, db: Session = Depends(get_db)
) -> AlgorithmAttemptRead:
    try:
        return update_attempt(db, request.state.user_id, attempt_id, payload)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/attempts/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_algorithm_attempt(attempt_id: int, request: Request, db: Session = Depends(get_db)) -> Response:
    try:
        delete_attempt(db, request.state.user_id, attempt_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/attempts/{attempt_id}/hint", response_model=AlgorithmHintRead)
async def get_algorithm_hint(
    attempt_id: int, payload: AlgorithmHintRequest, request: Request, db: Session = Depends(get_db)
) -> AlgorithmHintRead:
    try:
        return await request_hint(db, request.state.user_id, attempt_id, payload.hint_level, payload.approach)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 提示暂时不可用，已保存的解题记录不会丢失。") from exc


@router.post("/attempts/{attempt_id}/ai-review", response_model=AlgorithmAttemptRead)
async def review_algorithm_attempt(attempt_id: int, request: Request, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return await request_ai_review(db, request.state.user_id, attempt_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc
    except LLMError as exc:
        mark_ai_review_failed(db, request.state.user_id, attempt_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 复盘暂时不可用，可稍后重试；解题记录已保留。") from exc


@router.get("/reviews/due", response_model=list[AlgorithmReviewScheduleRead])
def list_due_algorithm_reviews(
    request: Request, limit: int = Query(default=30, ge=1, le=100), db: Session = Depends(get_db)
) -> list[AlgorithmReviewScheduleRead]:
    return due_reviews(db, request.state.user_id, limit=limit)


@router.get("/reviews/candidates", response_model=list[AlgorithmReviewCandidateRead])
def list_algorithm_review_candidates(
    request: Request,
    time_order: Literal["recommended", "recent", "older"] = "recommended",
    from_date: date_type | None = None,
    to_date: date_type | None = None,
    min_accuracy: int | None = Query(default=None, ge=0, le=100),
    max_accuracy: int | None = Query(default=None, ge=0, le=100),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlgorithmReviewCandidateRead]:
    return list_review_candidates(
        db,
        request.state.user_id,
        time_order=time_order,
        from_date=from_date,
        to_date=to_date,
        min_accuracy=min_accuracy,
        max_accuracy=max_accuracy,
        limit=limit,
    )


@router.post("/reviews/session", response_model=AlgorithmPracticeSessionRead, status_code=status.HTTP_201_CREATED)
def create_algorithm_review_session(
    request: Request,
    payload: AlgorithmReviewSessionCreate | None = None,
    count: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
) -> AlgorithmPracticeSessionRead:
    try:
        return create_review_session(db, request.state.user_id, count=payload.count if payload else count, problem_ids=payload.problem_ids if payload else None)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/stats", response_model=AlgorithmStatsRead)
def get_algorithm_stats(request: Request, db: Session = Depends(get_db)) -> AlgorithmStatsRead:
    return algorithm_stats(db, request.state.user_id)


@router.get("/weaknesses", response_model=list[AlgorithmWeaknessRead])
def get_algorithm_weaknesses(request: Request, db: Session = Depends(get_db)) -> list[AlgorithmWeaknessRead]:
    return algorithm_weaknesses(db, request.state.user_id)


@router.post(
    "/problems/{problem_id}/hint",
    response_model=AlgorithmHintRead,
)
async def get_algorithm_problem_hint(
    problem_id: str,
    payload: AlgorithmProblemHintRequest,
    db: Session = Depends(get_db),
) -> AlgorithmHintRead:
    """按题目取渐进提示。不写库、不依赖 AlgorithmAttempt，核对之前也能用。"""

    try:
        problem = get_by_identifier(db, problem_id)
        if problem is None:
            raise AlgorithmPracticeError("算法题不存在。")
        content = await generate_algorithm_hint(
            problem=problem,
            approach=payload.approach,
            hint_level=payload.hint_level,
        )
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 提示暂时不可用，可以稍后重试；你的思路草稿留在本机，不会丢失。") from exc
    return AlgorithmHintRead(
        hint_level=payload.hint_level,
        content=content,
        remaining_hint_levels=max(0, 4 - payload.hint_level),
    )


@router.get(
    "/problems/{problem_id}/reasoning-context",
    response_model=AlgorithmProblemReasoningContextResponse,
)
def get_algorithm_reasoning_context(
    problem_id: str,
    db: Session = Depends(get_db),
) -> AlgorithmProblemReasoningContextResponse:
    try:
        return get_problem_reasoning_context(db, problem_id)
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc


@router.post(
    "/reasoning/answers",
    response_model=AlgorithmReasoningAnswerDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def save_algorithm_reasoning_answer(
    payload: AlgorithmReasoningAnswerCreate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AlgorithmReasoningAnswerDetailRead:
    try:
        answer, created = save_reasoning_answer(db, request.state.user_id, payload)
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc
    if not created:
        response.status_code = status.HTTP_200_OK
    return get_answer_detail(db, request.state.user_id, answer.id)


@router.post(
    "/reasoning/checks",
    response_model=AlgorithmReasoningCheckResponse,
    status_code=status.HTTP_201_CREATED,
)
async def check_algorithm_reasoning(payload: dict[str, object], response: Response, request: Request, db: Session = Depends(get_db)):
    try:
        parsed = AlgorithmReasoningCheckCreate.model_validate(payload)
    except ValidationError as exc:
        return _save_failed_response(exc)
    try:
        result, created = await save_and_check_reasoning_answer(db, request.state.user_id, parsed)
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc
    if not created:
        response.status_code = status.HTTP_200_OK
    return result


@router.post(
    "/reasoning/answers/{answer_id}/check",
    response_model=AlgorithmReasoningCheckResponse,
)
async def recheck_algorithm_reasoning_answer(
    answer_id: int,
    request: Request,
    payload: AlgorithmReasoningRecheckRequest | None = None,
    db: Session = Depends(get_db),
) -> AlgorithmReasoningCheckResponse:
    try:
        return await check_saved_reasoning_answer(db, request.state.user_id, answer_id, refresh=payload.refresh if payload else False)
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc


@router.get("/reasoning/answers/{answer_id}", response_model=AlgorithmReasoningAnswerDetailRead)
def get_algorithm_reasoning_answer(
    answer_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> AlgorithmReasoningAnswerDetailRead:
    try:
        return get_answer_detail(db, request.state.user_id, answer_id)
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc


@router.get("/reasoning/answers", response_model=list[AlgorithmReasoningAnswerDetailRead])
def list_algorithm_reasoning_answers(
    request: Request,
    problem_id: str | None = None,
    session_id: str | None = None,
    client_answer_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[AlgorithmReasoningAnswerDetailRead]:
    try:
        return list_reasoning_answers(
            db,
            request.state.user_id,
            problem_identifier=problem_id,
            session_id=session_id,
            client_answer_id=client_answer_id,
            limit=limit,
        )
    except AlgorithmReasoningError as exc:
        raise _reasoning_error(exc) from exc


@router.get("/problems/{problem_id}/similar", response_model=list[AlgorithmProblemRead])
def get_similar_algorithm_problems(
    problem_id: str, limit: int = Query(default=5, ge=1, le=5), db: Session = Depends(get_db)
) -> list[AlgorithmProblemRead]:
    try:
        return similar_problems(db, problem_id, limit=limit)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/problems/{problem_id}", response_model=AlgorithmProblemRead)
def get_algorithm_problem(problem_id: str, db: Session = Depends(get_db)) -> AlgorithmProblemRead:
    problem = get_by_identifier(db, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="算法题不存在")
    return problem
