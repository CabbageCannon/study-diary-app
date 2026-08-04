from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import StudySessionAction, StudySessionCreate, StudySessionRead
from app.services import study_session_service


router = APIRouter(prefix="/api/study-sessions", tags=["study-sessions"])


def _domain_error(exc: study_session_service.StudySessionError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("", response_model=StudySessionRead, status_code=status.HTTP_201_CREATED)
def create_study_session(payload: StudySessionCreate, db: Session = Depends(get_db)) -> StudySessionRead:
    try:
        session, created = study_session_service.create_session(db, payload)
    except study_session_service.StudySessionError as exc:
        raise _domain_error(exc) from exc
    # Replaying a queued start event returns the original resource instead of
    # creating a second study record.
    if not created:
        return session
    return session


@router.get("/active", response_model=StudySessionRead | None)
def get_active_study_session(db: Session = Depends(get_db)) -> StudySessionRead | None:
    return study_session_service.get_active_session(db)


@router.get("/today", response_model=list[StudySessionRead])
def get_today_study_sessions(
    local_date: date | None = Query(default=None, alias="date"),
    timezone_offset_minutes: int = Query(default=0, ge=-840, le=840),
    db: Session = Depends(get_db),
) -> list[StudySessionRead]:
    return study_session_service.list_today_sessions(db, local_date, timezone_offset_minutes)


@router.patch("/{session_id}/pause", response_model=StudySessionRead)
def pause_study_session(session_id: str, payload: StudySessionAction, db: Session = Depends(get_db)) -> StudySessionRead:
    try:
        return study_session_service.pause_session(db, session_id, payload)
    except study_session_service.StudySessionError as exc:
        raise _domain_error(exc) from exc


@router.patch("/{session_id}/resume", response_model=StudySessionRead)
def resume_study_session(session_id: str, payload: StudySessionAction, db: Session = Depends(get_db)) -> StudySessionRead:
    try:
        return study_session_service.resume_session(db, session_id, payload)
    except study_session_service.StudySessionError as exc:
        raise _domain_error(exc) from exc


@router.post("/{session_id}/complete", response_model=StudySessionRead)
def complete_study_session(session_id: str, payload: StudySessionAction, db: Session = Depends(get_db)) -> StudySessionRead:
    try:
        return study_session_service.complete_session(db, session_id, payload)
    except study_session_service.StudySessionError as exc:
        raise _domain_error(exc) from exc


@router.post("/{session_id}/abandon", response_model=StudySessionRead)
def abandon_study_session(session_id: str, payload: StudySessionAction, db: Session = Depends(get_db)) -> StudySessionRead:
    try:
        return study_session_service.abandon_session(db, session_id, payload)
    except study_session_service.StudySessionError as exc:
        raise _domain_error(exc) from exc
