import unittest
from datetime import datetime, timedelta, timezone
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
from app.models import AlgorithmAttempt, AlgorithmDailyFeed, AlgorithmProblem, AlgorithmProblemProgress, AlgorithmReasoningFeedback, AlgorithmReviewSchedule
from app.schemas import AlgorithmAIReview
from app.services.algorithm_practice_service import get_daily_feed, utc_now
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

    def update_daily_settings(self, **updates: object) -> dict[str, object]:
        current = self.client.get("/api/algorithms/daily-settings")
        self.assertEqual(current.status_code, 200, current.text)
        payload = {key: value for key, value in current.json().items() if key not in {"id", "created_at", "updated_at"}}
        payload.update(updates)
        response = self.client.patch("/api/algorithms/daily-settings", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
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

    def test_review_candidates_only_include_attempted_problems_and_create_selected_review_session(self) -> None:
        done_problem = self.session.query(AlgorithmProblem).filter_by(slug="two-sum").one()
        new_problem = self.session.query(AlgorithmProblem).filter_by(slug="group-anagrams").one()
        training = self.create_session("custom", count=1, problem_ids=[str(done_problem.id)])
        attempt = self.save_attempt(training, result="solved")

        candidates = self.client.get("/api/algorithms/reviews/candidates")
        self.assertEqual(candidates.status_code, 200, candidates.text)
        self.assertEqual([item["problem"]["id"] for item in candidates.json()], [done_problem.id])
        self.assertEqual(candidates.json()[0]["last_practiced_at"], attempt["submitted_at"])

        rejected = self.client.post("/api/algorithms/reviews/session", json={"problem_ids": [done_problem.id, new_problem.id]})
        self.assertEqual(rejected.status_code, 422)

        selected = self.client.post("/api/algorithms/reviews/session", json={"problem_ids": [done_problem.id]})
        self.assertEqual(selected.status_code, 201, selected.text)
        self.assertEqual(selected.json()["mode"], "review")
        self.assertEqual([item["problem_id"] for item in selected.json()["items"]], [done_problem.id])

    def test_review_candidates_filter_by_practice_date_and_accuracy(self) -> None:
        first_problem = self.session.query(AlgorithmProblem).filter_by(slug="two-sum").one()
        second_problem = self.session.query(AlgorithmProblem).filter_by(slug="group-anagrams").one()
        first_session = self.create_session("custom", count=1, problem_ids=[str(first_problem.id)])
        second_session = self.create_session("custom", count=1, problem_ids=[str(second_problem.id)])
        old_attempt = self.save_attempt(first_session, result="failed")
        recent_attempt = self.save_attempt(second_session, result="solved")
        self.session.get(AlgorithmAttempt, old_attempt["id"]).submitted_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.session.get(AlgorithmAttempt, recent_attempt["id"]).submitted_at = datetime(2026, 1, 5, tzinfo=timezone.utc)
        self.session.add(
            AlgorithmReasoningFeedback(
                answer_id=1,
                problem_context_id=1,
                synced_attempt_id=recent_attempt["id"],
                conclusion="partially_correct",
                headline="方向正确，边界不足。",
                context_sufficient=True,
                feedback_json='{"accuracy_score":72}',
                model_name="test",
                prompt_version="test",
                context_version=1,
            )
        )
        self.session.commit()

        recent = self.client.get("/api/algorithms/reviews/candidates?time_order=recent")
        self.assertEqual([item["problem"]["id"] for item in recent.json()], [second_problem.id, first_problem.id])

        older = self.client.get("/api/algorithms/reviews/candidates?time_order=older&to_date=2026-01-02")
        self.assertEqual([item["problem"]["id"] for item in older.json()], [first_problem.id])
        self.assertEqual(older.json()[0]["accuracy_score"], 20)

        partial = self.client.get("/api/algorithms/reviews/candidates?min_accuracy=70&max_accuracy=89")
        self.assertEqual([item["problem"]["id"] for item in partial.json()], [second_problem.id])
        self.assertEqual(partial.json()[0]["accuracy_score"], 72)

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

    def test_daily_feed_initializes_defaults_is_stable_and_keeps_daily_compatibility(self) -> None:
        settings = self.client.get("/api/algorithms/daily-settings")
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.json()["strategy"], "balanced")
        self.assertEqual(settings.json()["extra_recommendation_count"], 6)

        first = self.client.get("/api/algorithms/daily-feed")
        second = self.client.get("/api/algorithms/daily-feed")
        legacy = self.client.get("/api/algorithms/daily")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["primary_problem"]["id"], second.json()["primary_problem"]["id"])
        self.assertEqual(first.json()["primary_problem"]["id"], legacy.json()["id"])
        feed_ids = [first.json()["primary_problem"]["id"], *[item["id"] for item in first.json()["extra_problems"]]]
        self.assertEqual(len(feed_ids), len(set(feed_ids)))

    def test_daily_session_uses_requested_count_after_pinned_primary_problem(self) -> None:
        feed = self.client.get("/api/algorithms/daily-feed").json()
        response = self.client.post(
            "/api/algorithms/sessions",
            json={"mode": "daily", "count": 3, "problem_ids": [str(feed["primary_problem"]["id"])]},
        )
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        ids = [item["problem_id"] for item in body["items"]]
        self.assertEqual(len(ids), 3)
        self.assertEqual(ids[0], feed["primary_problem"]["id"])
        self.assertEqual(len(ids), len(set(ids)))

    def test_saving_daily_settings_does_not_replace_today_until_explicit_refresh(self) -> None:
        before = self.client.get("/api/algorithms/daily-feed").json()
        topic = self.session.query(AlgorithmProblem).filter(AlgorithmProblem.topics_json.contains("数组")).first().topics[0]
        updated = self.update_daily_settings(strategy="topic", topics=[topic], extra_recommendation_count=4)
        unchanged = self.client.get("/api/algorithms/daily-feed").json()
        self.assertEqual(updated["strategy"], "topic")
        self.assertEqual(before["refresh_version"], unchanged["refresh_version"])
        self.assertEqual(before["primary_problem"]["id"], unchanged["primary_problem"]["id"])

        refreshed = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["refresh_version"], before["refresh_version"] + 1)
        self.assertIn(topic, refreshed.json()["primary_problem"]["topics"])

    def test_refresh_preserves_existing_session_and_attempt_history(self) -> None:
        feed = self.client.get("/api/algorithms/daily-feed").json()
        training = self.create_session("daily", count=1, problem_ids=[str(feed["primary_problem"]["id"])])
        attempt = self.save_attempt(training, result="solved")
        refreshed = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(self.client.get(f"/api/algorithms/sessions/{training['id']}").status_code, 200)
        self.assertIsNotNone(self.session.get(AlgorithmAttempt, attempt["id"]))

    def test_daily_feed_strategies_fallback_and_refresh_validation(self) -> None:
        self.update_daily_settings(strategy="random", topics=[], difficulties=[], source_lists=[], extra_recommendation_count=4)
        first = self.client.post("/api/algorithms/daily-feed/refresh")
        second = self.client.get("/api/algorithms/daily-feed")
        self.assertEqual(first.status_code, 200)
        self.assertEqual([item["id"] for item in first.json()["extra_problems"]], [item["id"] for item in second.json()["extra_problems"]])

        self.update_daily_settings(strategy="topic", topics=["不存在的题型"], extra_recommendation_count=4)
        fallback = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(fallback.status_code, 200)
        self.assertIsNotNone(fallback.json()["warning"])

        invalid = self.client.patch("/api/algorithms/daily-settings", json={"extra_recommendation_count": 5})
        self.assertEqual(invalid.status_code, 422)

    def test_daily_feed_generates_a_new_assignment_on_a_new_date(self) -> None:
        settings = self.client.get("/api/algorithms/daily-settings")
        self.assertEqual(settings.status_code, 200)
        first_day = datetime(2026, 8, 3, 16, 30, tzinfo=timezone.utc)
        second_day = first_day + timedelta(days=1)
        with patch("app.services.algorithm_practice_service.utc_now", return_value=first_day):
            first = get_daily_feed(self.session)
        with patch("app.services.algorithm_practice_service.utc_now", return_value=second_day):
            second = get_daily_feed(self.session)
        self.assertEqual(first.date, "2026-08-04")
        self.assertEqual(second.date, "2026-08-05")
        self.assertNotEqual(first.date, second.date)
        self.assertNotIn(second.primary_problem.id, {first.primary_problem.id, *[problem.id for problem in first.extra_problems]})
        self.assertEqual(self.session.query(AlgorithmDailyFeed).count(), 2)

    def test_daily_feed_filters_and_review_priority_use_real_progress(self) -> None:
        medium_hot = self.session.query(AlgorithmProblem).filter_by(difficulty="medium").filter(AlgorithmProblem.source_lists_json.contains("hot100")).first()
        self.assertIsNotNone(medium_hot)
        self.update_daily_settings(strategy="source_list", source_lists=["hot100"], difficulties=["medium"], extra_recommendation_count=4)
        filtered = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(filtered.json()["primary_problem"]["difficulty"], "medium")
        self.assertIn("hot100", filtered.json()["primary_problem"]["source_lists"])

        training = self.create_session("custom", count=1, problem_ids=[str(medium_hot.id)])
        attempt = self.save_attempt(training, result="failed")
        schedule = self.session.query(AlgorithmReviewSchedule).filter_by(problem_id=attempt["problem_id"]).one()
        schedule.next_review_at = utc_now() - timedelta(minutes=1)
        self.session.commit()

        self.update_daily_settings(strategy="review_first", source_lists=[], difficulties=[], exclude_solved=False, extra_recommendation_count=4)
        review_first = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(review_first.status_code, 200, review_first.text)
        self.assertEqual(review_first.json()["primary_problem"]["id"], attempt["problem_id"])

    def test_daily_feed_can_expand_to_adjacent_difficulty_when_needed(self) -> None:
        desired_count = 5
        hard_count = self.session.query(AlgorithmProblem).filter_by(difficulty="hard", is_active=True).count()
        self.update_daily_settings(
            strategy="difficulty",
            topics=[],
            difficulties=["hard"],
            source_lists=[],
            extra_recommendation_count=desired_count - 1,
            include_adjacent_difficulty=True,
        )

        refreshed = self.client.post("/api/algorithms/daily-feed/refresh")
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        feed = refreshed.json()
        if hard_count < desired_count:
            selected = [feed["primary_problem"], *feed["extra_problems"]]
            self.assertTrue(any(problem["difficulty"] == "medium" for problem in selected))
            self.assertIn("相邻难度", feed["warning"])
