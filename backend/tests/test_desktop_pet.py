import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import database
from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import StudySession
from app.services import weather_service


class DesktopPetApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.previous_token = settings.app_access_token
        settings.app_access_token = "desktop-test-token"

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        weather_service.weather_cache.clear()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()
        settings.app_access_token = self.previous_token
        weather_service.weather_cache.clear()

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Study-Diary-Access": "desktop-test-token"}

    def create_session(self, client_event_id: str = "desktop-pet-start-0001") -> dict[str, object]:
        response = self.client.post(
            "/api/study-sessions",
            headers=self.headers,
            json={"client_event_id": client_event_id, "activity_type": "reading", "title": "系统设计阅读"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_study_session_lifecycle_is_idempotent_and_recoverable(self) -> None:
        created = self.create_session()
        replay = self.client.post(
            "/api/study-sessions",
            headers=self.headers,
            json={"client_event_id": "desktop-pet-start-0001", "activity_type": "reading", "title": "系统设计阅读"},
        )
        self.assertEqual(replay.status_code, 201, replay.text)
        self.assertEqual(replay.json()["id"], created["id"])
        self.assertEqual(self.session.query(StudySession).count(), 1)

        active = self.client.get("/api/study-sessions/active", headers=self.headers)
        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.json()["id"], created["id"])

        paused = self.client.patch(
            f"/api/study-sessions/{created['id']}/pause",
            headers=self.headers,
            json={"accumulated_seconds": 125},
        )
        self.assertEqual(paused.status_code, 200, paused.text)
        self.assertEqual(paused.json()["status"], "paused")
        resumed = self.client.patch(
            f"/api/study-sessions/{created['id']}/resume",
            headers=self.headers,
            json={"accumulated_seconds": 125},
        )
        self.assertEqual(resumed.status_code, 200, resumed.text)
        completed = self.client.post(
            f"/api/study-sessions/{created['id']}/complete",
            headers=self.headers,
            json={"accumulated_seconds": 180},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        replay_complete = self.client.post(
            f"/api/study-sessions/{created['id']}/complete",
            headers=self.headers,
            json={"accumulated_seconds": 180},
        )
        self.assertEqual(replay_complete.status_code, 200)
        self.assertEqual(replay_complete.json()["accumulated_seconds"], 180)
        self.assertIsNone(self.client.get("/api/study-sessions/active", headers=self.headers).json())

    def test_study_session_validation_and_access_protection(self) -> None:
        self.assertEqual(self.client.get("/api/study-sessions/active").status_code, 401)
        created = self.create_session()
        invalid = self.client.patch(
            f"/api/study-sessions/{created['id']}/pause",
            headers=self.headers,
            json={"accumulated_seconds": -1},
        )
        self.assertEqual(invalid.status_code, 422)
        duplicate = self.client.post(
            "/api/study-sessions",
            headers=self.headers,
            json={"client_event_id": "desktop-pet-start-0002", "activity_type": "algorithm", "title": "算法"},
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_settings_validate_sort_and_deduplicate_milestones(self) -> None:
        self.assertEqual(self.client.get("/api/desktop-pet/config").status_code, 401)
        response = self.client.patch(
            "/api/desktop-pet/config",
            headers=self.headers,
            json={
                "location_label": "东京",
                "latitude": 35.6762,
                "longitude": 139.6503,
                "weather_refresh_minutes": 20,
                "milestone_minutes": [50, 10, 20, 10],
                "milestone_display_seconds": 12,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["milestone_minutes"], [10, 20, 50])
        self.assertEqual(payload["milestone_display_seconds"], 12)
        invalid = self.client.patch(
            "/api/desktop-pet/config",
            headers=self.headers,
            json={"milestone_minutes": [0]},
        )
        self.assertEqual(invalid.status_code, 422)

    def test_weather_cache_returns_stale_data_after_provider_failure(self) -> None:
        configured = self.client.patch(
            "/api/desktop-pet/config",
            headers=self.headers,
            json={"location_label": "东京", "latitude": 35.6762, "longitude": 139.6503},
        )
        self.assertEqual(configured.status_code, 200)
        snapshot = weather_service.WeatherSnapshot("东京", "rain", True, 24.5, weather_service.utc_now())
        with patch("app.services.weather_service.fetch_current_weather", new=AsyncMock(return_value=snapshot)):
            first = self.client.get("/api/desktop-pet/weather", headers=self.headers)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertFalse(first.json()["stale"])
        cache_entry = next(iter(weather_service.weather_cache.values()))
        cache_entry.fetched_at = weather_service.utc_now() - timedelta(minutes=16)
        with patch(
            "app.services.weather_service.fetch_current_weather",
            new=AsyncMock(side_effect=weather_service.WeatherProviderError("offline")),
        ):
            stale = self.client.get("/api/desktop-pet/weather", headers=self.headers)
        self.assertEqual(stale.status_code, 200, stale.text)
        self.assertTrue(stale.json()["stale"])
        self.assertTrue(stale.json()["is_raining"])
