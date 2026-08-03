import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlgorithmReviewSchedule, DesktopPetSettings, InterviewReviewSchedule, StudySession
from app.schemas import (
    DesktopPetDashboardRead,
    DesktopPetSettingsRead,
    DesktopPetSettingsUpdate,
    DesktopPetWeatherRead,
)
from app.services import study_session_service, weather_service


router = APIRouter(prefix="/api/desktop-pet", tags=["desktop-pet"])


def _get_settings(db: Session) -> DesktopPetSettings:
    settings = db.get(DesktopPetSettings, 1)
    if settings:
        return settings
    settings = DesktopPetSettings(id=1)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/config", response_model=DesktopPetSettingsRead)
def get_desktop_pet_settings(db: Session = Depends(get_db)) -> DesktopPetSettingsRead:
    return _get_settings(db)


@router.patch("/config", response_model=DesktopPetSettingsRead)
def update_desktop_pet_settings(payload: DesktopPetSettingsUpdate, db: Session = Depends(get_db)) -> DesktopPetSettingsRead:
    settings = _get_settings(db)
    updates = payload.model_dump(exclude_unset=True)
    milestones = updates.pop("milestone_minutes", None)
    for field, value in updates.items():
        setattr(settings, field, value)
    if milestones is not None:
        settings.milestone_minutes_json = json.dumps(milestones)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/weather", response_model=DesktopPetWeatherRead)
async def get_desktop_pet_weather(db: Session = Depends(get_db)) -> DesktopPetWeatherRead:
    settings = _get_settings(db)
    try:
        snapshot, stale = await weather_service.get_weather(settings)
    except weather_service.WeatherProviderError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return DesktopPetWeatherRead(
        location=snapshot.location,
        condition=snapshot.condition,
        is_raining=snapshot.is_raining,
        temperature_c=snapshot.temperature_c,
        observed_at=snapshot.observed_at,
        provider=snapshot.provider,
        stale=stale,
    )


@router.get("/dashboard", response_model=DesktopPetDashboardRead)
def get_desktop_pet_dashboard(db: Session = Depends(get_db)) -> DesktopPetDashboardRead:
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today = list(
        db.scalars(
            select(StudySession)
            .where(StudySession.source == "desktop_pet", StudySession.started_at >= day_start)
            .order_by(StudySession.updated_at.desc())
        ).all()
    )
    active = study_session_service.get_active_session(db)
    total_seconds = sum(study_session_service.current_elapsed_seconds(item, now) for item in today)
    due_interview_reviews = db.scalar(
        select(func.count()).select_from(InterviewReviewSchedule).where(InterviewReviewSchedule.next_review_at <= now)
    ) or 0
    due_algorithm_reviews = db.scalar(
        select(func.count()).select_from(AlgorithmReviewSchedule).where(AlgorithmReviewSchedule.next_review_at <= now)
    ) or 0
    return DesktopPetDashboardRead(
        today_study_seconds=total_seconds,
        active_session=active,
        due_interview_reviews=due_interview_reviews,
        due_algorithm_reviews=due_algorithm_reviews,
        recent_study_sessions=today[:5],
    )
