from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings


def app_timezone() -> ZoneInfo:
    """Return the configured timezone, falling back to UTC for an invalid value."""
    try:
        return ZoneInfo(settings.app_timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def as_utc(value: datetime) -> datetime:
    aware_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware_value.astimezone(timezone.utc)


def app_local_date(value: datetime) -> date:
    return as_utc(value).astimezone(app_timezone()).date()


def app_local_day_end_utc(value: date) -> datetime:
    local_end = datetime.combine(value, time.max, tzinfo=app_timezone())
    return local_end.astimezone(timezone.utc)
