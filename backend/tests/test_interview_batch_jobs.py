import asyncio
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import database
from app.config import settings
from app.database import Base, get_db
from app.llm import LLMError
from app.main import app
from app.models import InterviewBatchJob, InterviewQuestion
from app.repositories.interview_repository import upsert_question
from app.schemas import InterviewBatchJobCreate, InterviewQuestionAIReview
from app.services import interview_batch_job_service as batch_job_service
from app.routers import interviews as interviews_router
from tests.test_interview_review_workflow import review_payload, seed


class InterviewBatchJobTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.session_factory()
        for question_id in ("batch-job-a", "batch-job-b", "batch-job-c"):
            upsert_question(self.session, seed(question_id))
        self.session.commit()

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.previous_session_local = batch_job_service.SessionLocal
        batch_job_service.SessionLocal = self.session_factory
        self.previous_flags = {
            "allow_question_review": settings.allow_question_review,
            "allow_ai_question_review": settings.allow_ai_question_review,
            "allow_question_quick_publish": settings.allow_question_quick_publish,
            "batch_ai_review_concurrency": settings.batch_ai_review_concurrency,
        }
        settings.allow_question_review = True
        settings.allow_ai_question_review = True
        settings.allow_question_quick_publish = True
        settings.batch_ai_review_concurrency = 2

    def tearDown(self) -> None:
        batch_job_service.SessionLocal = self.previous_session_local
        for name, value in self.previous_flags.items():
            setattr(settings, name, value)
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()

    def create_job(self, job_type: str, question_ids: list[str]) -> InterviewBatchJob:
        return batch_job_service.create_batch_job(
            self.session,
            InterviewBatchJobCreate(type=job_type, question_ids=question_ids, auto_publish=True),
        )

    def test_create_endpoint_returns_queued_job_and_status_is_queryable(self) -> None:
        async def leave_queued(_job_id: str) -> None:
            return None

        with patch.object(interviews_router, "run_batch_job", leave_queued):
            response = self.client.post(
                "/api/interviews/batch-jobs",
                json={"type": "ai_review", "question_ids": ["batch-job-a"], "auto_publish": True},
            )
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual((body["status"], body["total"], body["type"]), ("queued", 1, "ai_review"))

        detail = self.client.get(f"/api/interviews/batch-jobs/{body['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["items"][0]["status"], "pending")
        listed = self.client.get("/api/interviews/batch-jobs?status=queued")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["id"], body["id"])

    def test_ai_job_limits_concurrency_and_keeps_processing_after_item_failure(self) -> None:
        active = 0
        maximum_active = 0

        async def mixed_review(_db: Session, question: InterviewQuestion, *, auto_publish: bool):
            nonlocal active, maximum_active
            active += 1
            maximum_active = max(maximum_active, active)
            await asyncio.sleep(0.02)
            active -= 1
            if question.id == "batch-job-b":
                raise LLMError("model unavailable")
            review = review_payload()
            return review, question.id == "batch-job-a"

        job = self.create_job("ai_review", ["batch-job-a", "batch-job-b", "batch-job-c"])
        with patch.object(batch_job_service, "run_ai_review", mixed_review):
            asyncio.run(batch_job_service.run_batch_job(job.id))

        self.session.expire_all()
        result = batch_job_service.serialize_batch_job(self.session, self.session.get(InterviewBatchJob, job.id))
        self.assertEqual(result.status, "partial_failed")
        self.assertEqual((result.succeeded_count, result.failed_count, result.published_count), (2, 1, 1))
        self.assertLessEqual(maximum_active, 2)

    def test_running_job_does_not_block_other_api_requests_and_restart_marks_it_failed(self) -> None:
        job = self.create_job("quick_publish", ["batch-job-a"])
        job.status = "running"
        self.session.commit()

        response = self.client.get("/api/interviews/questions")
        self.assertEqual(response.status_code, 200)

        original_engine = database.engine
        database.engine = self.engine
        try:
            database._mark_interrupted_batch_jobs_failed()
        finally:
            database.engine = original_engine
        self.session.refresh(job)
        self.assertEqual(job.status, "failed")
        self.assertIn("服务重启", job.error or "")

    def test_batch_job_request_keeps_existing_limit(self) -> None:
        response = self.client.post(
            "/api/interviews/batch-jobs",
            json={"type": "reject", "question_ids": [f"question-{index}" for index in range(31)]},
        )
        self.assertEqual(response.status_code, 422)
