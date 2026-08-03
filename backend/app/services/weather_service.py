from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from app.models import DesktopPetSettings


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}


class WeatherProviderError(RuntimeError):
    pass


@dataclass
class WeatherSnapshot:
    location: str
    condition: str
    is_raining: bool
    temperature_c: float | None
    observed_at: datetime | None
    provider: str = "open-meteo"


@dataclass
class CachedWeather:
    snapshot: WeatherSnapshot
    fetched_at: datetime


weather_cache: dict[tuple[float, float], CachedWeather] = {}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _cache_key(settings: DesktopPetSettings) -> tuple[float, float]:
    assert settings.latitude is not None and settings.longitude is not None
    return (round(settings.latitude, 4), round(settings.longitude, 4))


def _condition_from_code(code: int | None) -> tuple[str, bool]:
    if code is None:
        return "unknown", False
    if code in RAIN_CODES:
        return "rain", True
    if code in {71, 73, 75, 77, 85, 86}:
        return "snow", False
    if code in {0, 1}:
        return "clear", False
    if code in {2, 3}:
        return "cloudy", False
    if code in {45, 48}:
        return "fog", False
    return "overcast", False


async def fetch_current_weather(settings: DesktopPetSettings) -> WeatherSnapshot:
    if settings.latitude is None or settings.longitude is None:
        raise WeatherProviderError("请先在桌宠设置中填写经纬度")
    params = {
        "latitude": settings.latitude,
        "longitude": settings.longitude,
        "current": "temperature_2m,weather_code",
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError("天气服务暂时不可用") from exc

    current = payload.get("current")
    if not isinstance(current, dict):
        raise WeatherProviderError("天气服务返回了无效数据")
    raw_code = current.get("weather_code")
    code = int(raw_code) if isinstance(raw_code, (int, float)) else None
    condition, is_raining = _condition_from_code(code)
    observed_at = None
    raw_observed_at = current.get("time")
    if isinstance(raw_observed_at, str):
        try:
            observed_at = datetime.fromisoformat(raw_observed_at)
            if observed_at.tzinfo is None:
                observed_at = observed_at.replace(tzinfo=timezone.utc)
        except ValueError:
            observed_at = None
    raw_temperature = current.get("temperature_2m")
    temperature = float(raw_temperature) if isinstance(raw_temperature, (int, float)) else None
    return WeatherSnapshot(
        location=settings.location_label or f"{settings.latitude:.2f}, {settings.longitude:.2f}",
        condition=condition,
        is_raining=is_raining,
        temperature_c=temperature,
        observed_at=observed_at,
    )


async def get_weather(settings: DesktopPetSettings) -> tuple[WeatherSnapshot, bool]:
    if not settings.weather_enabled:
        return WeatherSnapshot(settings.location_label, "disabled", False, None, None, "disabled"), False
    if settings.latitude is None or settings.longitude is None:
        return WeatherSnapshot(settings.location_label, "unknown", False, None, None), True

    key = _cache_key(settings)
    cached = weather_cache.get(key)
    refresh_window = timedelta(minutes=settings.weather_refresh_minutes)
    if cached and utc_now() - cached.fetched_at < refresh_window:
        return cached.snapshot, False
    try:
        snapshot = await fetch_current_weather(settings)
    except WeatherProviderError:
        if cached:
            return cached.snapshot, True
        raise
    weather_cache[key] = CachedWeather(snapshot=snapshot, fetched_at=utc_now())
    return snapshot, False
