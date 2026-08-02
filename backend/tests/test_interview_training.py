import unittest
from datetime import timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.llm import LLMError
from app.main import app
from app.models import InterviewAnswer, InterviewReviewSchedule
from app.repositories.interview_repository import upsert_question
from app.schemas import AnswerEvaluation, InterviewQuestionSeed
from app.services.interview_training_service import review_interval_days, utc_now


def question_payload(question_id: str, review_status: str) -> InterviewQuestionSeed:
    return InterviewQuestionSeed(
        id=question_id,
        domain="python",
        topic="asyncio",
        subtopic="event_loop",
        question=f"{question_id} 中阻塞调用为什么会影响并发处理？",
        difficulty="medium",
        question_type="concept_explanation",
        expected_duration_seconds=90,
        tags=["Python", "asyncio"],
        reference_points=["阻塞会占用事件循环", "异步 I/O 应使用 await", "CPU 任务应迁出事件循环"],
        evaluation_rubric=[
            {"point": "解释阻塞影响", "weight": 50, "mandatory": True},
            {"point": "给出处理方案", "weight": 50, "mandatory": True},
        ],
        common_mistakes=["只把函数改为 async", "直接在协程运行 CPU 密集循环"],
        oral_answer_outline=["解释事件循环", "给出 I/O 与 CPU 的处理区别"],
        reference_answer="在异步 Web 服务中，阻塞 I/O 会持续占用事件循环，其他协程无法获得执行机会。应使用可 await 的 I/O 客户端；CPU 密集工作应交给受控 worker 或进程池，同时设置超时和取消边界。",
        follow_up_questions=["线程池和进程池应如何选择？"],
        sources=[
            {
                "title": "Python asyncio Documentation",
                "url": "https://docs.python.org/3/library/asyncio.html",
                "source_type": "official_documentation",
                "license": "PSF License",
                "accessed_at": "2026-08-02",
            }
        ],
        review_status=review_status,
        verified_by_human=review_status == "verified",
        quality_score=85 if review_status == "verified" else None,
    )


async def successful_evaluation(*_args: object) -> tuple[AnswerEvaluation, str]:
    evaluation = AnswerEvaluation(
        correctness_score=80,
        completeness_score=70,
        structure_score=60,
        oral_clarity_score=90,
        matched_points=["说明阻塞会影响事件循环"],
        incorrect_points=[],
        missing_points=["没有说明取消策略"],
        improved_answer="阻塞调用会长期占用事件循环，使同一进程内其他协程无法及时执行。网络和文件操作应使用可 await 的客户端，CPU 密集任务则交给受控的进程池或独立 worker。无论采用哪种方式，都要设置超时、取消和容量限制，避免单个请求拖慢整个服务。",
        follow_up_questions=["如何处理已开始执行的线程池任务？"],
    )
    return evaluation, "{}"


async def failed_evaluation(*_args: object) -> tuple[AnswerEvaluation, str]:
    raise LLMError("模拟模型服务不可用")


class InterviewTrainingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        for question_id, status in (
            ("verified-training-001", "verified"),
            ("pending-training-001", "pending"),
            ("rejected-training-001", "rejected"),
        ):
            upsert_question(self.session, question_payload(question_id, status))
        self.session.commit()

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.previous_review_access = settings.allow_question_review
        self.previous_unverified_access = settings.allow_unverified_question_access
        settings.allow_question_review = False
        settings.allow_unverified_question_access = False

    def tearDown(self) -> None:
        settings.allow_question_review = self.previous_review_access
        settings.allow_unverified_question_access = self.previous_unverified_access
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()

    def create_set(self) -> dict[str, object]:
        response = self.client.post(
            "/api/interviews/question-sets",
            json={"domain": "python", "topic": "asyncio", "question_count": 3, "random_order": False},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_review_is_protected_and_verified_requires_quality(self) -> None:
        denied = self.client.patch(
            "/api/interviews/questions/pending-training-001/review",
            json={"review_status": "verified", "quality_score": 80},
        )
        self.assertEqual(denied.status_code, 403)

        settings.allow_question_review = True
        insufficient = self.client.patch(
            "/api/interviews/questions/pending-training-001/review",
            json={"review_status": "verified"},
        )
        self.assertEqual(insufficient.status_code, 422)

        verified = self.client.patch(
            "/api/interviews/questions/pending-training-001/review",
            json={"review_status": "verified", "quality_score": 80},
        )
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.json()["verified_by_human"])

        conflict = self.client.patch(
            "/api/interviews/questions/rejected-training-001/review",
            json={"question": verified.json()["question"]},
        )
        self.assertEqual(conflict.status_code, 422)

    def test_diary_api_remains_available_and_evaluation_schema_rejects_invalid_scores(self) -> None:
        diary_response = self.client.get("/api/diaries")
        self.assertEqual(diary_response.status_code, 200)

        with self.assertRaises(ValidationError):
            AnswerEvaluation(
                correctness_score=101,
                completeness_score=80,
                structure_score=80,
                oral_clarity_score=80,
                improved_answer="这是一段满足最小长度要求的改进答案，用于验证模型输出中的分数边界会被严格校验。",
            )

    def test_question_set_only_uses_verified_questions_and_shortage_is_explicit(self) -> None:
        question_set = self.create_set()
        self.assertEqual(question_set["question_count"], 1)
        self.assertEqual(question_set["available_question_count"], 1)
        self.assertIn("不足", question_set["availability_message"])
        self.assertEqual(question_set["items"][0]["question"]["id"], "verified-training-001")
        self.assertEqual(len({item["question"]["id"] for item in question_set["items"]}), 1)

    def test_answer_belongs_to_set_duplicate_is_rejected_and_retry_keeps_history(self) -> None:
        question_set = self.create_set()
        set_id = question_set["id"]
        wrong_question = self.client.post(
            f"/api/interviews/question-sets/{set_id}/answers",
            json={"question_id": "pending-training-001", "answer_text": "这是一个有效回答。", "answer_source": "text"},
        )
        self.assertEqual(wrong_question.status_code, 409)

        payload = {
            "question_id": "verified-training-001",
            "answer_text": "阻塞调用会占用事件循环，所以异步接口也会被拖慢。",
            "answer_source": "voice",
            "duration_seconds": 70,
        }
        with patch("app.services.interview_training_service.evaluate_interview_answer", successful_evaluation):
            submitted = self.client.post(f"/api/interviews/question-sets/{set_id}/answers", json=payload)
            self.assertEqual(submitted.status_code, 201)
            body = submitted.json()
            self.assertEqual(body["evaluation_status"], "completed")
            self.assertEqual(body["evaluation"]["total_score"], 74.5)
            self.assertIsNotNone(body["next_review_at"])

            duplicate = self.client.post(f"/api/interviews/question-sets/{set_id}/answers", json=payload)
            self.assertEqual(duplicate.status_code, 409)

            retry = self.client.post(f"/api/interviews/answers/{body['answer']['id']}/retry", json=payload)
            self.assertEqual(retry.status_code, 201)
            self.assertEqual(retry.json()["answer"]["attempt_index"], 2)

        answers = self.session.query(InterviewAnswer).filter_by(question_set_id=set_id).all()
        self.assertEqual(len(answers), 2)

    def test_evaluation_failure_preserves_answer_and_due_reviews_use_deterministic_rule(self) -> None:
        question_set = self.create_set()
        set_id = question_set["id"]
        payload = {
            "question_id": "verified-training-001",
            "answer_text": "这是一次应当被保留下来的口述回答。",
            "answer_source": "text",
        }
        with patch("app.services.interview_training_service.evaluate_interview_answer", failed_evaluation):
            response = self.client.post(f"/api/interviews/question-sets/{set_id}/answers", json=payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["evaluation_status"], "failed")
        answer_id = response.json()["answer"]["id"]
        self.assertIsNotNone(self.session.get(InterviewAnswer, answer_id))

        answer = self.session.get(InterviewAnswer, answer_id)
        assert answer is not None
        schedule = InterviewReviewSchedule(
            question_id="verified-training-001",
            last_answer_id=answer.id,
            last_score=55,
            next_review_at=utc_now() - timedelta(hours=1),
            review_interval_days=review_interval_days(55),
            review_count=1,
        )
        self.session.add(schedule)
        self.session.commit()
        due = self.client.get("/api/interviews/reviews/due?domain=python")
        self.assertEqual(due.status_code, 200)
        self.assertEqual(due.json()[0]["review_interval_days"], 1)
        self.assertEqual([review_interval_days(score) for score in (59, 60, 80, 90)], [1, 3, 7, 14])
