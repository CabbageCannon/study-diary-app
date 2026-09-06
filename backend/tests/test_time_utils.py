from datetime import date, datetime, timezone

from app.config import settings
from app.time_utils import app_local_date, app_local_day_end_utc


def test_app_local_date_uses_configured_timezone() -> None:
    original_timezone = settings.app_timezone
    settings.app_timezone = "Asia/Shanghai"
    try:
        assert app_local_date(datetime(2026, 8, 16, 16, 30, tzinfo=timezone.utc)) == date(2026, 8, 17)
    finally:
        settings.app_timezone = original_timezone


def test_app_local_day_end_is_converted_to_utc() -> None:
    original_timezone = settings.app_timezone
    settings.app_timezone = "Asia/Shanghai"
    try:
        assert app_local_day_end_utc(date(2026, 8, 17)) == datetime(
            2026,
            8,
            17,
            15,
            59,
            59,
            999999,
            tzinfo=timezone.utc,
        )
    finally:
        settings.app_timezone = original_timezone
