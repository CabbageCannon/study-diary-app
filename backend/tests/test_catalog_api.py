import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.config import settings
from app.main import app
from app.repositories.interview_repository import upsert_question
from app.schemas import InterviewQuestionSeed


def payload(question_id: str, review_status: str, verified_by_human: bool) -> InterviewQuestionSeed:
    return InterviewQuestionSeed(
        id=question_id,
        domain="python",
        topic="asyncio",
        subtopic="event_loop",
        question=f"{question_id} 中阻塞调用为什么会影响并发？",
        difficulty="medium",
        question_type="concept_explanation",
        expected_duration_seconds=90,
        tags=["Python"],
        reference_points=["要点一", "要点二", "要点三"],
        evaluation_rubric=[
            {"point": "核心要点", "weight": 50, "mandatory": True},
            {"point": "补充要点", "weight": 50, "mandatory": False},
        ],
        common_mistakes=["错误一", "错误二"],
        oral_answer_outline=["开场", "说明"],
        reference_answer="这是一个足够长的面试口述答案，用来验证默认审核过滤的 API 行为，并确保内容满足面试表达的最小长度要求。",
        follow_up_questions=["追问是什么？"],
        sources=[
            {
                "title": "Python Docs",
                "url": "https://docs.python.org/3/",
                "source_type": "official_documentation",
                "license": "PSF License",
                "accessed_at": "2026-08-02",
            }
        ],
        review_status=review_status,
        verified_by_human=verified_by_human,
    )


class CatalogApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        upsert_question(self.session, payload("pending-question-001", "pending", False))
        upsert_question(self.session, payload("verified-question-001", "verified", True))
        self.session.commit()

        def override_db():
            try:
                yield self.session
            finally:
                pass

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()

    def test_default_query_only_returns_verified_questions(self) -> None:
        response = self.client.get("/api/interviews/questions")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()], ["verified-question-001"])

        pending_response = self.client.get("/api/interviews/questions?review_status=pending")
        self.assertEqual(pending_response.status_code, 403)
        previous_value = settings.allow_unverified_question_access
        settings.allow_unverified_question_access = True
        self.addCleanup(setattr, settings, "allow_unverified_question_access", previous_value)
        pending_response = self.client.get("/api/interviews/questions?review_status=pending")
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual([item["id"] for item in pending_response.json()], ["pending-question-001"])
