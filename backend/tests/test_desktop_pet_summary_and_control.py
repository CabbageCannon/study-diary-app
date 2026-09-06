import unittest
from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import database
from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import StudySession
from app.services import study_session_service


class DesktopPetSummaryAndControlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.previous_token = settings.app_access_token
        settings.app_access_token = "desktop-test-token"
        self.sequence = 0

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()
        settings.app_access_token = self.previous_token

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Study-Diary-Access": "desktop-test-token"}

    def add_session(
        self,
        *,
        started_at: datetime,
        status: str = "completed",
        accumulated_seconds: int = 0,
        title: str = "自主学习",
        activity_type: str = "reading",
        last_resumed_at: datetime | None = None,
        updated_at: datetime | None = None,
    ) -> StudySession:
        self.sequence += 1
        item = StudySession(
            id=f"session-{self.sequence}",
            client_event_id=f"desktop-summary-event-{self.sequence}",
            source="desktop_pet",
            activity_type=activity_type,
            title=title,
            status=status,
            started_at=started_at,
            last_resumed_at=last_resumed_at,
            accumulated_seconds=accumulated_seconds,
            updated_at=updated_at or started_at,
        )
        self.session.add(item)
        self.session.commit()
        return item

    def summary(self, now: datetime | None = None) -> dict[str, object]:
        return study_session_service.get_study_summary(
            self.session,
            date(2026, 8, 4),
            480,
            now or datetime(2026, 8, 4, 4, 0, tzinfo=timezone.utc),
        )

    def test_summary_is_empty_without_sessions(self) -> None:
        summary = self.summary()
        self.assertEqual(summary["today_study_seconds"], 0)
        self.assertEqual(summary["total_study_seconds"], 0)
        self.assertEqual(summary["today_session_count"], 0)
        self.assertEqual(summary["today_topics"], [])

    def test_completed_and_paused_sessions_count_towards_today(self) -> None:
        started = datetime(2026, 8, 4, 1, 0, tzinfo=timezone.utc)
        self.add_session(started_at=started, status="completed", accumulated_seconds=150)
        self.add_session(started_at=started + timedelta(minutes=1), status="paused", accumulated_seconds=210)
        summary = self.summary()
        self.assertEqual(summary["today_study_seconds"], 360)
        self.assertEqual(summary["today_session_count"], 2)

    def test_running_session_uses_realtime_increment_once(self) -> None:
        now = datetime(2026, 8, 4, 4, 0, tzinfo=timezone.utc)
        self.add_session(
            started_at=now - timedelta(minutes=5),
            status="running",
            accumulated_seconds=120,
            last_resumed_at=now - timedelta(seconds=40),
        )
        summary = self.summary(now)
        self.assertEqual(summary["today_study_seconds"], 160)
        self.assertEqual(summary["total_study_seconds"], 160)
        self.assertEqual(summary["active_session"].status, "running")

    def test_total_includes_history_and_does_not_double_count_active_session(self) -> None:
        now = datetime(2026, 8, 4, 4, 0, tzinfo=timezone.utc)
        self.add_session(started_at=now - timedelta(days=2), accumulated_seconds=3_600)
        self.add_session(
            started_at=now - timedelta(minutes=10),
            status="running",
            accumulated_seconds=100,
            last_resumed_at=now - timedelta(seconds=20),
        )
        summary = self.summary(now)
        self.assertEqual(summary["today_study_seconds"], 120)
        self.assertEqual(summary["total_study_seconds"], 3_720)

    def test_topics_merge_sort_and_filter_blank_titles(self) -> None:
        now = datetime(2026, 8, 4, 4, 0, tzinfo=timezone.utc)
        self.add_session(started_at=now - timedelta(minutes=5), accumulated_seconds=110, title="Python", updated_at=now)
        self.add_session(started_at=now - timedelta(minutes=4), accumulated_seconds=90, title="Agent", updated_at=now - timedelta(minutes=1))
        self.add_session(started_at=now - timedelta(minutes=3), accumulated_seconds=80, title="Agent", updated_at=now)
        self.add_session(started_at=now - timedelta(minutes=2), accumulated_seconds=999, title="   ")
        summary = self.summary(now)
        topics = summary["today_topics"]
        self.assertEqual(summary["today_topic_count"], 2)
        self.assertEqual([item["title"] for item in topics], ["Agent", "Python"])
        self.assertEqual(topics[0]["study_seconds"], 170)

    def test_local_date_boundaries_cover_utc_plus_eight_and_nine(self) -> None:
        self.add_session(started_at=datetime(2026, 8, 3, 15, 59, 59, tzinfo=timezone.utc), accumulated_seconds=10)
        self.add_session(started_at=datetime(2026, 8, 3, 16, 0, tzinfo=timezone.utc), accumulated_seconds=20)
        self.add_session(started_at=datetime(2026, 8, 3, 14, 59, 59, tzinfo=timezone.utc), accumulated_seconds=30)
        self.add_session(started_at=datetime(2026, 8, 3, 15, 0, tzinfo=timezone.utc), accumulated_seconds=40)
        utc_plus_eight = study_session_service.get_study_summary(
            self.session, date(2026, 8, 4), 480, datetime(2026, 8, 4, 4, tzinfo=timezone.utc)
        )
        utc_plus_nine = study_session_service.get_study_summary(
            self.session, date(2026, 8, 4), 540, datetime(2026, 8, 4, 4, tzinfo=timezone.utc)
        )
        self.assertEqual(utc_plus_eight["today_study_seconds"], 20)
        self.assertEqual(utc_plus_nine["today_study_seconds"], 70)

    def test_today_endpoint_validates_offset_and_uses_local_boundary(self) -> None:
        self.assertEqual(
            self.client.get("/api/study-sessions/today?date=2026-08-04&timezone_offset_minutes=900", headers=self.headers).status_code,
            422,
        )
        self.add_session(started_at=datetime(2026, 8, 3, 16, 0, tzinfo=timezone.utc), accumulated_seconds=20)
        response = self.client.get(
            "/api/study-sessions/today?date=2026-08-04&timezone_offset_minutes=480", headers=self.headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 1)

    def test_start_complete_and_dashboard_share_the_same_completed_session(self) -> None:
        create_payload = {
            "client_event_id": "desktop-api-complete-event-1",
            "activity_type": "reading",
            "title": "同步链路测试",
            "started_at": "2026-08-04T01:00:00Z",
        }
        self.assertEqual(self.client.post("/api/study-sessions", json=create_payload).status_code, 401)

        created = self.client.post("/api/study-sessions", headers=self.headers, json=create_payload)
        self.assertEqual(created.status_code, 201, created.text)
        session_id = created.json()["id"]

        completed = self.client.post(
            f"/api/study-sessions/{session_id}/complete",
            headers=self.headers,
            json={"accumulated_seconds": 330, "occurred_at": "2026-08-04T01:05:30Z"},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["status"], "completed")
        self.assertEqual(completed.json()["accumulated_seconds"], 330)

        for timezone_offset_minutes in (480, 540):
            dashboard = self.client.get(
                f"/api/desktop-pet/dashboard?date=2026-08-04&timezone_offset_minutes={timezone_offset_minutes}",
                headers=self.headers,
            )
            self.assertEqual(dashboard.status_code, 200, dashboard.text)
            self.assertEqual(dashboard.headers["cache-control"], "no-store")
            data = dashboard.json()
            self.assertEqual(data["today_session_count"], 1)
            self.assertEqual(data["today_study_seconds"], 330)
            self.assertGreaterEqual(data["total_study_seconds"], 330)
            self.assertEqual(data["today_topics"][0]["title"], "同步链路测试")

        replay = self.client.post("/api/study-sessions", headers=self.headers, json=create_payload)
        self.assertEqual(replay.status_code, 201, replay.text)
        self.assertEqual(replay.json()["id"], session_id)
        self.assertEqual(self.session.query(StudySession).count(), 1)

    def test_show_control_requires_access_and_is_versioned(self) -> None:
        self.assertEqual(self.client.post("/api/desktop-pet/control/show").status_code, 401)
        first = self.client.post("/api/desktop-pet/control/show", headers=self.headers)
        second = self.client.post("/api/desktop-pet/control/show", headers=self.headers)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["show_request_version"], 1)
        self.assertEqual(second.json()["show_request_version"], 2)
        offline_state = self.client.get("/api/desktop-pet/control", headers=self.headers)
        self.assertEqual(offline_state.status_code, 200)
        self.assertIsNone(offline_state.json()["desktop_last_seen_at"])
        self.assertTrue(offline_state.json()["show_request_pending"])

    def test_show_control_ack_is_idempotent_and_old_ack_cannot_replace_newer_request(self) -> None:
        self.client.post("/api/desktop-pet/control/show", headers=self.headers)
        self.client.post("/api/desktop-pet/control/show", headers=self.headers)
        old_ack = self.client.post("/api/desktop-pet/control/show/1/ack", headers=self.headers)
        self.assertEqual(old_ack.status_code, 200, old_ack.text)
        self.assertEqual(old_ack.json()["show_acknowledged_version"], 1)
        self.assertTrue(old_ack.json()["show_request_pending"])
        current_ack = self.client.post("/api/desktop-pet/control/show/2/ack", headers=self.headers)
        replay_ack = self.client.post("/api/desktop-pet/control/show/2/ack", headers=self.headers)
        self.assertEqual(current_ack.status_code, 200)
        self.assertEqual(replay_ack.status_code, 200)
        self.assertEqual(replay_ack.json()["show_acknowledged_version"], 2)
        self.assertFalse(replay_ack.json()["show_request_pending"])
        future_ack = self.client.post("/api/desktop-pet/control/show/3/ack", headers=self.headers)
        self.assertEqual(future_ack.status_code, 409)
