from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.interview_repository import get_question, list_questions
from app.schemas import InterviewQuestionRead


router = APIRouter(prefix="/api/interviews", tags=["interviews"])


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
    """Verified questions are the default pool; pending content needs an explicit development query."""
    return list_questions(
        db,
        domain=domain,
        topic=topic.strip() if topic else None,
        difficulty=difficulty,
        review_status=review_status,
        random_order=random_order,
        count=count,
    )


@router.get("/questions/{question_id}", response_model=InterviewQuestionRead)
def get_interview_question(
    question_id: str,
    review_status: Literal["pending", "verified", "rejected"] = "verified",
    db: Session = Depends(get_db),
) -> InterviewQuestionRead:
    question = get_question(db, question_id)
    if question is None or not question.is_active or question.review_status != review_status:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="八股题不存在或尚未通过审核")
    return question
