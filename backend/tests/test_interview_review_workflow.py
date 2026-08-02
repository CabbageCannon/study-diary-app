import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app import database
from app.database import Base, get_db
from app.llm import LLMError
from app.main import app
from app.models import InterviewQuestion
from app.repositories.interview_repository import upsert_question
from app.schemas import InterviewQuestionAIReview, InterviewQuestionSeed


def seed(question_id: str, *, status: str = "pending") -> InterviewQuestionSeed:
    return InterviewQuestionSeed(
        id=question_id,
        domain="python",
        topic="asyncio",
        subtopic="event_loop",
        question=f"Why should {question_id} avoid blocking work inside an async request handler?",
        difficulty="medium",
        question_type="concept_explanation",
        expected_duration_seconds=90,
        tags=["Python", "asyncio"],
        reference_points=["The event loop is shared", "Awaitable I/O yields control", "CPU work needs isolation"],
        evaluation_rubric=[
            {"point": "Explains event-loop blocking", "weight": 50, "mandatory": True},
            {"point": "Gives a safe alternative", "weight": 50, "mandatory": True},
        ],
        common_mistakes=["Using async without changing blocking libraries", "Running CPU work in the event loop"],
        oral_answer_outline=["Explain the blocked loop", "Contrast I/O and CPU work"],
        reference_answer="A blocking call prevents the event loop from serving other coroutines. Use awaitable I/O for network and file work, and move CPU-heavy work to a controlled worker or process pool with timeouts and cancellation boundaries.",
        follow_up_questions=["How do threads and processes differ for CPU-bound work?"],
        sources=[
            {
                "title": "Python asyncio documentation",
                "url": "https://docs.python.org/3/library/asyncio.html",
                "source_type": "official_documentation",
                "license": "PSF License",
                "accessed_at": "2026-08-02",
            }
        ],
        review_status=status,
        verified_by_human=status == "verified",
        human_quality_score=88 if status == "verified" else None,
    )


def review_payload(*, risk: bool = False) -> InterviewQuestionAIReview:
    return InterviewQuestionAIReview(
        quality_score=92,
        clarity_score=90,
        technical_score=93,
        interview_value_score=91,
        source_support_score=88,
        factual_risk=risk,
        duplicate_risk=False,
        issues=["Clarify the timeout boundary"] if risk else [],
        suggested_changes=["Mention cancellation explicitly"] if risk else [],
        recommended_status="verified",
    )


async def successful_review(*_args: object) -> tuple[InterviewQuestionAIReview, str]:
    return review_payload(), review_payload().model_dump_json()


class InterviewReviewWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        for question_id, status in (("review-pending-a", "pending"), ("review-pending-b", "pending"), ("review-human", "verified"), ("review-rejected", "rejected")):
            upsert_question(self.session, seed(question_id, status=status))
        pending = self.session.get(InterviewQuestion, "review-pending-a")
        assert pending is not None
        pending.human_quality_score = 72
        pending.quality_score = 72
        self.session.commit()

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.previous_flags = {
            "allow_question_review": settings.allow_question_review,
            "allow_ai_question_review": settings.allow_ai_question_review,
            "allow_question_quick_publish": settings.allow_question_quick_publish,
        }
        settings.allow_question_review = True
        settings.allow_ai_question_review = False
        settings.allow_question_quick_publish = False

    def tearDown(self) -> None:
        for name, value in self.previous_flags.items():
            setattr(settings, name, value)
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()

    def test_ai_review_is_gated_and_does_not_overwrite_human_score(self) -> None:
        denied = self.client.post("/api/interviews/questions/review-pending-a/ai-review", json={"auto_publish": True})
        self.assertEqual(denied.status_code, 403)

        settings.allow_ai_question_review = True
        with patch("app.services.interview_question_review_service.review_interview_question", successful_review):
            response = self.client.post("/api/interviews/questions/review-pending-a/ai-review", json={"auto_publish": True})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["published"])
        stored = self.session.get(InterviewQuestion, "review-pending-a")
        assert stored is not None
        self.assertEqual(stored.review_status, "verified")
        self.assertEqual(stored.review_method, "ai_auto")
        self.assertFalse(stored.verified_by_human)
        self.assertEqual(stored.human_quality_score, 72)
        self.assertEqual(stored.ai_quality_score, 92)

    def test_factual_risk_keeps_question_pending_and_apply_uses_saved_review(self) -> None:
        async def risky_review(*_args: object) -> tuple[InterviewQuestionAIReview, str]:
            review = review_payload(risk=True)
            return review, review.model_dump_json()

        settings.allow_ai_question_review = True
        with patch("app.services.interview_question_review_service.review_interview_question", risky_review):
            response = self.client.post("/api/interviews/questions/review-pending-b/ai-review", json={"auto_publish": True})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["published"])
        self.assertEqual(self.session.get(InterviewQuestion, "review-pending-b").review_status, "pending")

        self.assertEqual(self.client.post("/api/interviews/questions/review-pending-b/ai-review/apply").json()["published"], False)

    def test_batch_continues_after_single_item_failure_and_limits_size(self) -> None:
        async def mixed_review(question: InterviewQuestion) -> tuple[InterviewQuestionAIReview, str]:
            if question.id == "review-pending-b":
                raise LLMError("model unavailable")
            review = review_payload()
            return review, review.model_dump_json()

        settings.allow_ai_question_review = True
        with patch("app.services.interview_question_review_service.review_interview_question", mixed_review):
            response = self.client.post(
                "/api/interviews/questions/ai-review-batch",
                json={"question_ids": ["review-pending-a", "review-pending-b", "review-human", "review-rejected"], "auto_publish": True},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual((body["reviewed"], body["published"], body["failed"], body["skipped"]), (1, 1, 1, 2))

        oversized = self.client.post(
            "/api/interviews/questions/ai-review-batch",
            json={"question_ids": [f"question-{index}" for index in range(31)]},
        )
        self.assertEqual(oversized.status_code, 422)

    def test_quick_publish_is_gated_and_is_not_human_verification(self) -> None:
        denied = self.client.post("/api/interviews/questions/publish-batch", json={"question_ids": ["review-pending-a"]})
        self.assertEqual(denied.status_code, 403)

        settings.allow_question_quick_publish = True
        published = self.client.post("/api/interviews/questions/publish-batch", json={"question_ids": ["review-pending-a"]})
        self.assertEqual(published.status_code, 200)
        stored = self.session.get(InterviewQuestion, "review-pending-a")
        assert stored is not None
        self.assertEqual(stored.review_method, "manual_override")
        self.assertFalse(stored.verified_by_human)

    def test_batch_reject_uses_human_review_method_and_honors_limit(self) -> None:
        response = self.client.post(
            "/api/interviews/questions/reject-batch",
            json={"question_ids": ["review-pending-a", "review-rejected", "missing-question"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["reviewed"], response.json()["skipped"]), (1, 2))
        stored = self.session.get(InterviewQuestion, "review-pending-a")
        assert stored is not None
        self.assertEqual(stored.review_status, "rejected")
        self.assertEqual(stored.review_method, "human")
        self.assertFalse(stored.verified_by_human)

        oversized = self.client.post(
            "/api/interviews/questions/reject-batch",
            json={"question_ids": [f"question-{index}" for index in range(31)]},
        )
        self.assertEqual(oversized.status_code, 422)

    def test_ai_review_schema_rejects_invalid_scores(self) -> None:
        with self.assertRaises(ValidationError):
            InterviewQuestionAIReview(
                quality_score=101,
                clarity_score=80,
                technical_score=80,
                interview_value_score=80,
                source_support_score=80,
                factual_risk=False,
                duplicate_risk=False,
            )


class ReviewMetadataMigrationTests(unittest.TestCase):
    def test_existing_sqlite_interview_table_receives_review_metadata_columns(self) -> None:
        legacy_engine = create_engine("sqlite://")
        with legacy_engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE interview_questions (id VARCHAR(160) PRIMARY KEY)")

        original_engine = database.engine
        database.engine = legacy_engine
        try:
            database._apply_sqlite_review_metadata_migration()
            columns = {column["name"] for column in inspect(legacy_engine).get_columns("interview_questions")}
        finally:
            database.engine = original_engine

        self.assertTrue(set(database.INTERVIEW_REVIEW_COLUMN_DEFINITIONS).issubset(columns))
