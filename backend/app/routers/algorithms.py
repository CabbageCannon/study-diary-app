from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.algorithm_repository import get_by_identifier, list_problems
from app.schemas import AlgorithmProblemRead


router = APIRouter(prefix="/api/algorithms", tags=["algorithms"])


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
    # Completion records are not part of the current MVP; the parameter is reserved for that relation.
    del exclude_completed
    return list_problems(
        db,
        difficulty=difficulty,
        pattern=pattern.strip() if pattern else None,
        topic=topic.strip() if topic else None,
        source_list=source_list.strip() if source_list else None,
        limit=limit,
    )


@router.get("/problems/{problem_id}", response_model=AlgorithmProblemRead)
def get_algorithm_problem(problem_id: str, db: Session = Depends(get_db)) -> AlgorithmProblemRead:
    problem = get_by_identifier(db, problem_id)
    if problem is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="算法题不存在")
    return problem
