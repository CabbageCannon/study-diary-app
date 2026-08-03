import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import database
from app.database import Base, get_db
from app.llm import LLMError
from app.main import app
from app.models import AlgorithmAttempt, AlgorithmProblem, AlgorithmProblemProgress, AlgorithmReviewSchedule
from app.schemas import AlgorithmAIReview
from app.services.algorithm_practice_service import utc_now
from app.services.data_import_service import import_algorithms


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "algorithms" / "problem_catalog.json"


async def ai_review_with_invalid_recommendation(*_args: object, **_kwargs: object) -> AlgorithmAIReview:
    return AlgorithmAIReview(
        summary="思路方向正确，但需要补充边界情况。",
        approach_assessment="当前记录说明了核心结构，但缺少关键不变量。",
        time_complexity_assessment={"user_claim": "O(n)", "suggested": "O(n)", "is_likely_correct": True, "reason": "单次遍历。"},
        space_complexity_assessment={"user_claim": "O(n)", "suggested": "O(n)", "is_likely_correct": True, "reason": "辅助哈希表。"},
        code_review={"has_code": False},
        needs_review=True,
        weak_topics=["数组"],
        recommended_problem_ids=[999_999],
    )


async def ai_review_failure(*_args: object, **_kwargs: object) -> AlgorithmAIReview:
    raise LLMError("simulated outage")


class AlgorithmPracticeApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        import_algorithms(self.session, CATALOG_PATH)

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()

    def create_session(self, mode: str = "hot100", **extra: object) -> dict[str, object]:
        response = self.client.post("/api/algorithms/sessions", json={"mode": mode, "count": 3, **extra})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def save_attempt(self, session_payload: dict[str, object], *, result: str = "failed") -> dict[str, object]:
        item = session_payload["items"][0]
        response = self.client.post(
            "/api/algorithms/attempts",
            json={
                "problem_id": item["problem_id"],
                "session_id": session_payload["id"],
                "result": result,
                "duration_seconds": 75,
                "approach": "记录候选值并逐步验证。",
                "time_complexity": "O(n)",
                "space_complexity": "O(n)",
                "reflection": "下一次先写出不变量。",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_catalog_import_is_idempotent_and_preserves_progress(self) -> None:
        first_problem = self.session.query(AlgorithmProblem).order_by(AlgorithmProblem.id).first()
        self.assertIsNotNone(first_problem)
        progress = AlgorithmProblemProgress(problem_id=first_problem.id, status="solved", attempt_count=4, solved_count=3)
        self.session.add(progress)
        self.session.commit()

        result = import_algorithms(self.session, CATALOG_PATH)
        self.assertEqual(result.created, 0)
        self.assertEqual(result.skipped, 18)
        persisted = self.session.query(AlgorithmProblemProgress).filter_by(problem_id=first_problem.id).one()
        self.assertEqual(persisted.attempt_count, 4)
        self.assertEqual(persisted.status, "solved")

    def test_daily_selection_is_stable_and_training_modes_use_local_catalog(self) -> None:
        first_daily = self.client.get("/api/algorithms/daily")
        second_daily = self.client.get("/api/algorithms/daily")
        self.assertEqual(first_daily.status_code, 200)
        self.assertEqual(first_daily.json()["id"], second_daily.json()["id"])

        topic = self.create_session("topic", topics=["动态规划"])
        difficulty = self.create_session("difficulty", difficulty=["easy"])
        random_session = self.create_session("random")
        similar_reference = self.session.query(AlgorithmProblem).filter_by(slug="two-sum").one()
        similar = self.create_session("similar", reference_problem_id=str(similar_reference.id))
        custom_reference = self.session.query(AlgorithmProblem).filter_by(slug="group-anagrams").one()
        custom = self.create_session("custom", count=2, problem_ids=[str(similar_reference.id), str(custom_reference.id)])
        for payload in (topic, difficulty, random_session, similar, custom):
            ids = [item["problem_id"] for item in payload["items"]]
            self.assertEqual(len(ids), len(set(ids)))
            restored = self.client.get(f"/api/algorithms/sessions/{payload['id']}")
            self.assertEqual(restored.status_code, 200)
            self.assertEqual([item["problem_id"] for item in restored.json()["items"]], ids)

    def test_attempts_are_append_only_and_drive_wrong_review_progress(self) -> None:
        training = self.create_session()
        first = self.save_attempt(training, result="failed")
        second = self.save_attempt(training, result="solved")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(self.session.query(AlgorithmAttempt).count(), 2)

        problem_id = first["problem_id"]
        progress = self.session.query(AlgorithmProblemProgress).filter_by(problem_id=problem_id).one()
        schedule = self.session.query(AlgorithmReviewSchedule).filter_by(problem_id=problem_id).one()
        self.assertEqual(progress.attempt_count, 2)
        self.assertEqual(schedule.last_attempt_id, second["id"])
        self.assertGreaterEqual(schedule.interval_days, 1)

    def test_deleting_latest_attempt_rebuilds_progress_and_review_schedule(self) -> None:
        training = self.create_session()
        first = self.save_attempt(training, result="failed")
        second = self.save_attempt(training, result="solved")

        deleted = self.client.delete(f"/api/algorithms/attempts/{second['id']}")
        self.assertEqual(deleted.status_code, 204, deleted.text)
        progress = self.session.query(AlgorithmProblemProgress).filter_by(problem_id=first["problem_id"]).one()
        schedule = self.session.query(AlgorithmReviewSchedule).filter_by(problem_id=first["problem_id"]).one()
        self.assertEqual(progress.attempt_count, 1)
        self.assertEqual(progress.last_result, "failed")
        self.assertEqual(schedule.last_attempt_id, first["id"])

        deleted_first = self.client.delete(f"/api/algorithms/attempts/{first['id']}")
        self.assertEqual(deleted_first.status_code, 204, deleted_first.text)
        self.assertEqual(self.session.query(AlgorithmProblemProgress).filter_by(problem_id=first["problem_id"]).count(), 0)
        self.assertEqual(self.session.query(AlgorithmReviewSchedule).filter_by(problem_id=first["problem_id"]).count(), 0)

    def test_due_reviews_create_fixed_review_session_and_deleting_session_keeps_problem(self) -> None:
        training = self.create_session()
        attempt = self.save_attempt(training, result="gave_up")
        schedule = self.session.query(AlgorithmReviewSchedule).filter_by(problem_id=attempt["problem_id"]).one()
        schedule.next_review_at = utc_now() - timedelta(minutes=1)
        self.session.commit()

        due = self.client.get("/api/algorithms/reviews/due")
        self.assertEqual(due.status_code, 200)
        self.assertEqual(due.json()[0]["problem"]["id"], attempt["problem_id"])
        review_session = self.client.post("/api/algorithms/reviews/session?count=3")
        self.assertEqual(review_session.status_code, 201)
        self.assertEqual(review_session.json()["items"][0]["problem_id"], attempt["problem_id"])

        removed = self.client.delete(f"/api/algorithms/sessions/{training['id']}")
        self.assertEqual(removed.status_code, 204)
        self.assertIsNotNone(self.session.get(AlgorithmProblem, attempt["problem_id"]))

    def test_ai_recommendations_are_filtered_to_local_candidates_and_failure_keeps_attempt(self) -> None:
        training = self.create_session()
        attempt = self.save_attempt(training, result="partially_solved")
        with patch("app.services.algorithm_practice_service.generate_algorithm_ai_review", ai_review_with_invalid_recommendation):
            reviewed = self.client.post(f"/api/algorithms/attempts/{attempt['id']}/ai-review")
        self.assertEqual(reviewed.status_code, 200, reviewed.text)
        self.assertEqual(reviewed.json()["ai_feedback"]["recommended_problem_ids"], [])

        with patch("app.services.algorithm_practice_service.generate_algorithm_ai_review", ai_review_failure):
            failed = self.client.post(f"/api/algorithms/attempts/{attempt['id']}/ai-review")
        self.assertEqual(failed.status_code, 503)
        persisted = self.session.get(AlgorithmAttempt, attempt["id"])
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted.ai_feedback_status, "failed")
