import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlgorithmReviewSchedule, DesktopPetControl, DesktopPetSettings, InterviewReviewSchedule
from app.schemas import (
    DesktopPetControlState,
    DesktopPetDashboardRead,
    DesktopPetSettingsRead,
    DesktopPetSettingsUpdate,
    DesktopPetWeatherRead,
    ShowDesktopPetResponse,
)
from app.services import study_session_service, weather_service


router = APIRouter(prefix="/api/desktop-pet", tags=["desktop-pet"])
SHOW_REQUEST_TTL_SECONDS = 45


def _get_settings(db: Session) -> DesktopPetSettings:
    settings = db.get(DesktopPetSettings, 1)
    if settings:
        return settings
    settings = DesktopPetSettings(id=1)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def _get_control(db: Session, *, lock: bool = False) -> DesktopPetControl:
    query = select(DesktopPetControl).where(DesktopPetControl.id == 1)
    if lock:
        query = query.with_for_update()
    control = db.scalar(query)
    if control:
        return control
    try:
        with db.begin_nested():
            control = DesktopPetControl(id=1)
            db.add(control)
            db.flush()
    except IntegrityError:
        control = db.scalar(query)
        if control:
            return control
        raise
    return control


def _control_state(control: DesktopPetControl, now=None) -> DesktopPetControlState:
    current = now or study_session_service.utc_now()
    request_is_fresh = bool(
        control.show_requested_at
        and (current - study_session_service.as_utc(control.show_requested_at)).total_seconds() <= SHOW_REQUEST_TTL_SECONDS
    )
    return DesktopPetControlState(
        show_request_version=control.show_request_version,
        show_acknowledged_version=control.show_acknowledged_version,
        show_requested_at=control.show_requested_at,
        desktop_last_seen_at=control.desktop_last_seen_at,
        show_request_pending=(
            request_is_fresh and control.show_request_version > control.show_acknowledged_version
        ),
    )


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


@router.post("/control/show", response_model=ShowDesktopPetResponse)
def request_show_desktop_pet(db: Session = Depends(get_db)) -> ShowDesktopPetResponse:
    control = _get_control(db, lock=True)
    control.show_request_version += 1
    control.show_requested_at = study_session_service.utc_now()
    db.commit()
    db.refresh(control)
    return ShowDesktopPetResponse(**_control_state(control).model_dump())


@router.get("/control", response_model=DesktopPetControlState)
def get_desktop_pet_control(
    desktop_client: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> DesktopPetControlState:
    control = _get_control(db, lock=desktop_client)
    if desktop_client:
        control.desktop_last_seen_at = study_session_service.utc_now()
        db.commit()
        db.refresh(control)
    return _control_state(control)


@router.post("/control/show/{request_version}/ack", response_model=DesktopPetControlState)
def acknowledge_show_desktop_pet(
    request_version: int = Path(ge=1),
    db: Session = Depends(get_db),
) -> DesktopPetControlState:
    control = _get_control(db, lock=True)
    if request_version > control.show_request_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="不能确认尚未创建的显示请求")
    control.show_acknowledged_version = max(control.show_acknowledged_version, request_version)
    control.desktop_last_seen_at = study_session_service.utc_now()
    db.commit()
    db.refresh(control)
    return _control_state(control)


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
def get_desktop_pet_dashboard(
    local_date: date | None = Query(default=None, alias="date"),
    timezone_offset_minutes: int = Query(default=0, ge=-840, le=840),
    db: Session = Depends(get_db),
) -> DesktopPetDashboardRead:
    now = study_session_service.utc_now()
    summary = study_session_service.get_study_summary(db, local_date, timezone_offset_minutes, now)
    due_interview_reviews = db.scalar(
        select(func.count()).select_from(InterviewReviewSchedule).where(InterviewReviewSchedule.next_review_at <= now)
    ) or 0
    due_algorithm_reviews = db.scalar(
        select(func.count()).select_from(AlgorithmReviewSchedule).where(AlgorithmReviewSchedule.next_review_at <= now)
    ) or 0
    return DesktopPetDashboardRead(
        **summary,
        due_interview_reviews=due_interview_reviews,
        due_algorithm_reviews=due_algorithm_reviews,
    )
