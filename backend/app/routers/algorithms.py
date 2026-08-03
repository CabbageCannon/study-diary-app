from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm import LLMError
from app.repositories.algorithm_practice_repository import get_problem, list_attempts
from app.repositories.algorithm_repository import get_by_identifier, list_problems
from app.schemas import (
    AlgorithmAttemptCreate,
    AlgorithmAttemptRead,
    AlgorithmAttemptUpdate,
    AlgorithmHintRead,
    AlgorithmHintRequest,
    AlgorithmPracticeSessionCreate,
    AlgorithmPracticeSessionProgressUpdate,
    AlgorithmPracticeSessionRead,
    AlgorithmPracticeSessionSummary,
    AlgorithmProblemRead,
    AlgorithmReviewScheduleRead,
    AlgorithmStatsRead,
    AlgorithmWeaknessRead,
)
from app.services.algorithm_practice_service import (
    AlgorithmPracticeError,
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
    get_session_read,
    list_session_summaries,
    mark_ai_review_failed,
    request_ai_review,
    request_hint,
    similar_problems,
    skip_session_problem,
    update_attempt,
    update_session_progress,
)


router = APIRouter(prefix="/api/algorithms", tags=["algorithms"])


def _domain_error(exc: AlgorithmPracticeError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.get("/problems", response_model=list[AlgorithmProblemRead])
def list_algorithm_problems(
    difficulty: Literal["easy", "medium", "hard"] | None = None,
    pattern: str | None = None,
    topic: str | None = None,
    source_list: str | None = None,
    exclude_completed: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlgorithmProblemRead]:
    del exclude_completed
    return list_problems(
        db,
        difficulty=difficulty,
        pattern=pattern.strip() if pattern else None,
        topic=topic.strip() if topic else None,
        source_list=source_list.strip() if source_list else None,
        limit=limit,
    )


@router.get("/daily", response_model=AlgorithmProblemRead)
def get_daily_problem(db: Session = Depends(get_db)) -> AlgorithmProblemRead:
    try:
        return daily_problem(db)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions", response_model=AlgorithmPracticeSessionRead, status_code=status.HTTP_201_CREATED)
def create_algorithm_session(
    payload: AlgorithmPracticeSessionCreate, db: Session = Depends(get_db)
) -> AlgorithmPracticeSessionRead:
    try:
        return create_session(db, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/sessions", response_model=list[AlgorithmPracticeSessionSummary])
def list_algorithm_sessions(
    status_filter: Literal["in_progress", "completed", "abandoned"] | None = Query(default=None, alias="status"),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[AlgorithmPracticeSessionSummary]:
    return list_session_summaries(db, status=status_filter, limit=limit)


@router.get("/sessions/{session_id}", response_model=AlgorithmPracticeSessionRead)
def get_algorithm_session(session_id: str, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return get_session_read(db, session_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/sessions/{session_id}/progress", response_model=AlgorithmPracticeSessionRead)
def update_algorithm_session_progress(
    session_id: str, payload: AlgorithmPracticeSessionProgressUpdate, db: Session = Depends(get_db)
) -> AlgorithmPracticeSessionRead:
    try:
        return update_session_progress(db, session_id, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/skip", response_model=AlgorithmPracticeSessionRead)
def skip_algorithm_session_problem(session_id: str, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return skip_session_problem(db, session_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/complete", response_model=AlgorithmPracticeSessionRead)
def complete_algorithm_session(session_id: str, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return finish_session(db, session_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.post("/sessions/{session_id}/abandon", response_model=AlgorithmPracticeSessionRead)
def abandon_algorithm_session(session_id: str, db: Session = Depends(get_db)) -> AlgorithmPracticeSessionRead:
    try:
        return finish_session(db, session_id, abandoned=True)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_algorithm_session(session_id: str, db: Session = Depends(get_db)) -> Response:
    try:
        delete_session(db, session_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/attempts", response_model=AlgorithmAttemptRead, status_code=status.HTTP_201_CREATED)
def save_algorithm_attempt(payload: AlgorithmAttemptCreate, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return create_attempt(db, payload)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/attempts", response_model=list[AlgorithmAttemptRead])
def list_algorithm_attempts(
    problem_id: int | None = None,
    session_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[AlgorithmAttemptRead]:
    return [AlgorithmAttemptRead.model_validate(attempt) for attempt in list_attempts(db, problem_id=problem_id, session_id=session_id, limit=limit)]


@router.get("/attempts/{attempt_id}", response_model=AlgorithmAttemptRead)
def get_algorithm_attempt(attempt_id: int, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return get_attempt_read(db, attempt_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/attempts/{attempt_id}", response_model=AlgorithmAttemptRead)
def patch_algorithm_attempt(
    attempt_id: int, payload: AlgorithmAttemptUpdate, db: Session = Depends(get_db)
) -> AlgorithmAttemptRead:
    try:
        return update_attempt(db, attempt_id, payload)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/attempts/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_algorithm_attempt(attempt_id: int, db: Session = Depends(get_db)) -> Response:
    try:
        delete_attempt(db, attempt_id)
    except AlgorithmPracticeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/attempts/{attempt_id}/hint", response_model=AlgorithmHintRead)
async def get_algorithm_hint(
    attempt_id: int, payload: AlgorithmHintRequest, db: Session = Depends(get_db)
) -> AlgorithmHintRead:
    try:
        return await request_hint(db, attempt_id, payload.hint_level, payload.approach)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 提示暂时不可用，已保存的解题记录不会丢失。") from exc


@router.post("/attempts/{attempt_id}/ai-review", response_model=AlgorithmAttemptRead)
async def review_algorithm_attempt(attempt_id: int, db: Session = Depends(get_db)) -> AlgorithmAttemptRead:
    try:
        return await request_ai_review(db, attempt_id)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc
    except LLMError as exc:
        mark_ai_review_failed(db, attempt_id)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI 复盘暂时不可用，可稍后重试；解题记录已保留。") from exc


@router.get("/reviews/due", response_model=list[AlgorithmReviewScheduleRead])
def list_due_algorithm_reviews(
    limit: int = Query(default=30, ge=1, le=100), db: Session = Depends(get_db)
) -> list[AlgorithmReviewScheduleRead]:
    return due_reviews(db, limit=limit)


@router.post("/reviews/session", response_model=AlgorithmPracticeSessionRead, status_code=status.HTTP_201_CREATED)
def create_algorithm_review_session(
    count: int = Query(default=5, ge=1, le=20), db: Session = Depends(get_db)
) -> AlgorithmPracticeSessionRead:
    try:
        return create_review_session(db, count=count)
    except AlgorithmPracticeError as exc:
        raise _domain_error(exc) from exc


@router.get("/stats", response_model=AlgorithmStatsRead)
def get_algorithm_stats(db: Session = Depends(get_db)) -> AlgorithmStatsRead:
    return algorithm_stats(db)


@router.get("/weaknesses", response_model=list[AlgorithmWeaknessRead])
def get_algorithm_weaknesses(db: Session = Depends(get_db)) -> list[AlgorithmWeaknessRead]:
    return algorithm_weaknesses(db)


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
