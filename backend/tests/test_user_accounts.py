"""End-to-end account gate and cross-user ownership checks."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import AuthIdentity
from app.database import Base, get_db
from app.main import app
from app.models import AlgorithmAttempt, AlgorithmProblem, InterviewQuestionSet


ADMIN = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"


async def fake_verify(token: str) -> AuthIdentity:
    if token == "admin":
        return AuthIdentity(ADMIN, "admin@example.com")
    if token == "other":
        return AuthIdentity(OTHER, "other@example.com")
    raise AssertionError("unexpected token")


class AccountIsolationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)

        def db_override():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = db_override
        self.patches = [
            patch("app.main.SessionLocal", self.sessions),
            patch("app.main.verify_session", fake_verify),
            patch("app.main.settings.admin_user_id", ADMIN),
            patch("app.routers.accounts.settings.admin_user_id", ADMIN),
            patch("app.routers.accounts._auth_users", return_value=[
                {"id": ADMIN, "email": "admin@example.com", "created_at": "2026-09-24T00:00:00Z"},
                {"id": OTHER, "email": "other@example.com", "created_at": "2026-09-24T00:00:00Z"},
            ]),
        ]
        for active_patch in self.patches:
            active_patch.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        for active_patch in reversed(self.patches):
            active_patch.stop()
        self.engine.dispose()

    def call(self, user: str, method: str, path: str, **kwargs):
        return self.client.request(method, path, headers={"Authorization": f"Bearer {user}"}, **kwargs)

    def test_login_gate_owner_filters_preferences_and_disable(self) -> None:
        self.assertEqual(self.client.get("/api/diaries").status_code, 401)
        self.assertEqual(self.client.get("/api/health").status_code, 200)

        diary = self.call("admin", "POST", "/api/diaries", json={
            "date": "2026-09-24", "title": "私人记录", "raw_text": "今天学习了数据库索引。",
            "polished_text": "今天学习了数据库索引。", "summary": "索引", "tags": ["数据库"],
        })
        self.assertEqual(diary.status_code, 201, diary.text)
        diary_id = diary.json()["id"]
        self.assertEqual(self.call("other", "GET", "/api/diaries").json(), [])
        self.assertEqual(self.call("other", "GET", f"/api/diaries/{diary_id}").status_code, 404)
        self.assertEqual(self.call("other", "DELETE", f"/api/diaries/{diary_id}").status_code, 404)
        self.assertEqual(len(self.call("admin", "GET", "/api/diaries").json()), 1)

        with self.sessions() as db:
            db.add(InterviewQuestionSet(user_id=ADMIN, date="2026-09-24", question_count=0))
            db.commit()
            set_id = db.query(InterviewQuestionSet.id).first()[0]
        self.assertEqual(self.call("other", "GET", f"/api/interviews/question-sets/{set_id}").status_code, 404)
        self.assertEqual(self.call("other", "GET", "/api/interviews/question-sets").json(), [])

        with self.sessions() as db:
            problem = AlgorithmProblem(
                stable_key="test:one", platform="test", external_id="one", title="测试题",
                slug="test-one", url="https://example.com/one", difficulty="easy",
                pattern_key="array", source_name="test", source_license="test",
            )
            db.add(problem)
            db.flush()
            attempt = AlgorithmAttempt(user_id=ADMIN, problem_id=problem.id, result="solved")
            db.add(attempt)
            db.commit()
            attempt_id = attempt.id
        self.assertEqual(self.call("other", "GET", f"/api/algorithms/attempts/{attempt_id}").status_code, 404)
        self.assertEqual(self.call("other", "DELETE", f"/api/algorithms/attempts/{attempt_id}").status_code, 404)
        self.assertEqual(self.call("admin", "GET", f"/api/algorithms/attempts/{attempt_id}").status_code, 200)
        self.assertEqual(self.call("other", "GET", "/api/algorithms/stats").json()["total_attempt_count"], 0)

        self.assertEqual(self.call("admin", "GET", "/api/algorithms/daily-settings").status_code, 200)
        self.assertEqual(self.call("other", "GET", "/api/algorithms/daily-settings").status_code, 200)
        self.assertEqual(self.call("admin", "GET", "/api/admin/users").status_code, 200)
        self.assertEqual(self.call("other", "GET", "/api/admin/users").status_code, 403)
        disabled = self.call("admin", "PATCH", f"/api/admin/users/{OTHER}/status", json={"active": False})
        self.assertEqual(disabled.status_code, 200, disabled.text)
        self.assertEqual(self.call("other", "GET", "/api/me").status_code, 403)
        self.assertEqual(self.call("admin", "PATCH", f"/api/admin/users/{OTHER}/status", json={"active": True}).status_code, 200)
        self.assertEqual(self.call("other", "GET", "/api/me").status_code, 200)


if __name__ == "__main__":
    unittest.main()
