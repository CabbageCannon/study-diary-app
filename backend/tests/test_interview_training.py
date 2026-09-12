import unittest
from datetime import timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import database
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

    def test_mobile_diary_draft_can_be_published_and_pinned(self) -> None:
        created = self.client.post("/api/diaries", json={
            "date": "2026-09-09", "title": "未完成的日记", "raw_text": "写到一半",
            "polished_text": "写到一半", "summary": "写到一半", "tags": ["生活"],
            "category": "life", "status": "draft", "images": [],
        })
        self.assertEqual(created.status_code, 201)
        diary_id = created.json()["id"]
        updated = self.client.patch(f"/api/diaries/{diary_id}", json={"status": "published", "is_pinned": True})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "published")
        self.assertTrue(updated.json()["is_pinned"])

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
            self.assertEqual(body["evaluation_status"], "processing")
            self.assertIsNone(body["evaluation"])
            self.session.expire_all()
            saved_answer = self.session.get(InterviewAnswer, body["answer"]["id"])
            assert saved_answer is not None
            self.assertEqual(saved_answer.evaluation_status, "completed")

            duplicate = self.client.post(f"/api/interviews/question-sets/{set_id}/answers", json=payload)
            self.assertEqual(duplicate.status_code, 409)

            retry = self.client.post(f"/api/interviews/answers/{body['answer']['id']}/retry", json=payload)
            self.assertEqual(retry.status_code, 201)
            self.assertEqual(retry.json()["evaluation_status"], "processing")
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
        self.assertEqual(response.json()["evaluation_status"], "processing")
        answer_id = response.json()["answer"]["id"]
        self.session.expire_all()
        self.assertIsNotNone(self.session.get(InterviewAnswer, answer_id))

        answer = self.session.get(InterviewAnswer, answer_id)
        assert answer is not None
        self.assertEqual(answer.evaluation_status, "failed")
        self.assertEqual(answer.evaluation_error, "模拟模型服务不可用")

        with patch("app.services.interview_training_service.evaluate_interview_answer", successful_evaluation):
            retry_evaluation = self.client.post(f"/api/interviews/answers/{answer_id}/evaluate")
        self.assertEqual(retry_evaluation.status_code, 200)
        self.assertEqual(retry_evaluation.json()["evaluation_status"], "processing")
        self.session.expire_all()
        answer = self.session.get(InterviewAnswer, answer_id)
        assert answer is not None
        self.assertEqual(answer.evaluation_status, "completed")

        schedule = self.session.query(InterviewReviewSchedule).filter_by(question_id="verified-training-001").one()
        schedule.last_score = 55
        schedule.next_review_at = utc_now() - timedelta(hours=1)
        schedule.review_interval_days = review_interval_days(55)
        self.session.commit()
        due = self.client.get("/api/interviews/reviews/due?domain=python")
        self.assertEqual(due.status_code, 200)
        self.assertEqual(due.json()[0]["review_interval_days"], 1)
        self.assertEqual([review_interval_days(score) for score in (59, 60, 80, 90)], [1, 3, 7, 14])


class InterviewSessionStateApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        for question_id in ("session-state-001", "session-state-002", "session-state-003"):
            upsert_question(self.session, question_payload(question_id, "verified"))
        self.session.commit()

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
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

    def skip_all_questions(self, set_id: int) -> None:
        for _ in range(3):
            response = self.client.post(f"/api/interviews/question-sets/{set_id}/skip")
            self.assertEqual(response.status_code, 200)

    def test_new_set_progress_and_reload_use_persistent_in_progress_state(self) -> None:
        created = self.create_set()
        self.assertEqual(created["status"], "in_progress")
        second = created["items"][1]
        update = self.client.patch(
            f"/api/interviews/question-sets/{created['id']}/progress",
            json={"current_index": 1, "last_active_question_id": second["question"]["id"]},
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["current_index"], 1)

        restored = self.client.get(f"/api/interviews/question-sets/{created['id']}")
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.json()["current_question"]["id"], second["question"]["id"])
        self.assertEqual(restored.json()["last_active_question_id"], second["question"]["id"])

    def test_complete_and_abandon_have_guarded_lifecycle(self) -> None:
        created = self.create_set()
        set_id = created["id"]
        incomplete = self.client.post(f"/api/interviews/question-sets/{set_id}/complete")
        self.assertEqual(incomplete.status_code, 409)

        self.skip_all_questions(set_id)
        completed = self.client.post(f"/api/interviews/question-sets/{set_id}/complete")
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["status"], "completed")
        self.assertIsNotNone(completed.json()["completed_at"])
        self.assertEqual(
            self.client.patch(f"/api/interviews/question-sets/{set_id}/progress", json={"current_index": 0}).status_code,
            409,
        )

        in_progress = self.create_set()
        abandoned = self.client.post(f"/api/interviews/question-sets/{in_progress['id']}/abandon")
        self.assertEqual(abandoned.status_code, 200)
        self.assertEqual(abandoned.json()["status"], "abandoned")
        self.assertIsNotNone(abandoned.json()["abandoned_at"])

    def test_status_filters_restart_and_delete_preserve_original_questions(self) -> None:
        created = self.create_set()
        set_id = created["id"]
        in_progress = self.client.get("/api/interviews/question-sets?status=in_progress")
        self.assertEqual(in_progress.status_code, 200)
        self.assertIn(set_id, [item["id"] for item in in_progress.json()])

        with patch("app.services.interview_training_service.evaluate_interview_answer", successful_evaluation):
            submitted = self.client.post(
                f"/api/interviews/question-sets/{set_id}/answers",
                json={
                    "question_id": created["items"][0]["question"]["id"],
                    "answer_text": "这是一条会在删除训练记录时被一并清理的回答。",
                    "answer_source": "text",
                },
            )
        self.assertEqual(submitted.status_code, 201)
        restarted = self.client.post(f"/api/interviews/question-sets/{set_id}/restart")
        self.assertEqual(restarted.status_code, 201)
        self.assertNotEqual(restarted.json()["id"], set_id)
        self.assertFalse(any(item["latest_answer"] for item in restarted.json()["items"]))

        deleted = self.client.delete(f"/api/interviews/question-sets/{set_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get(f"/api/interviews/question-sets/{set_id}").status_code, 404)
        self.assertEqual(
            self.client.get("/api/interviews/questions/session-state-001").status_code,
            200,
        )

    def test_delete_question_set_removes_schedule_before_answer_when_no_replacement(self) -> None:
        created = self.create_set()
        set_id = created["id"]
        question_id = created["items"][0]["question"]["id"]

        with patch("app.services.interview_training_service.evaluate_interview_answer", successful_evaluation):
            submitted = self.client.post(
                f"/api/interviews/question-sets/{set_id}/answers",
                json={
                    "question_id": question_id,
                    "answer_text": "这条回答被复习计划引用，删除题集时没有其它回答可替换。",
                    "answer_source": "text",
                },
            )
        self.assertEqual(submitted.status_code, 201)
        answer_id = submitted.json()["answer"]["id"]
        self.session.expire_all()
        schedule = self.session.query(InterviewReviewSchedule).filter_by(question_id=question_id).one()
        self.assertEqual(schedule.last_answer_id, answer_id)

        deleted = self.client.delete(f"/api/interviews/question-sets/{set_id}")
        self.assertEqual(deleted.status_code, 204)
        self.session.expire_all()
        self.assertIsNone(self.session.get(InterviewAnswer, answer_id))
        self.assertEqual(self.session.query(InterviewReviewSchedule).filter_by(question_id=question_id).count(), 0)

    def test_stats_uses_persisted_answers_and_pending_sessions(self) -> None:
        created = self.create_set()
        with patch("app.services.interview_training_service.evaluate_interview_answer", successful_evaluation):
            response = self.client.post(
                f"/api/interviews/question-sets/{created['id']}/answers",
                json={
                    "question_id": created["items"][0]["question"]["id"],
                    "answer_text": "这是一条用于验证学习统计聚合接口的有效回答。",
                    "answer_source": "text",
                },
            )
        self.assertEqual(response.status_code, 201)
        stats = self.client.get("/api/interviews/stats")
        self.assertEqual(stats.status_code, 200)
        body = stats.json()
        self.assertEqual(body["today_answered_count"], 1)
        self.assertEqual(body["total_answered_count"], 1)
        self.assertEqual(body["in_progress_count"], 1)
        self.assertEqual(body["domains"][0]["domain"], "python")


class InterviewSessionMigrationTests(unittest.TestCase):
    def test_existing_sqlite_question_sets_receive_session_columns_and_active_status_is_upgraded(self) -> None:
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE interview_question_sets ("
                "id INTEGER PRIMARY KEY, date VARCHAR(10), domain VARCHAR(80), topic VARCHAR(100), "
                "difficulty VARCHAR(20), question_count INTEGER, status VARCHAR(20), current_index INTEGER, "
                "created_at DATETIME, completed_at DATETIME)"
            )
            connection.exec_driver_sql(
                "INSERT INTO interview_question_sets "
                "(id, date, question_count, status, current_index, created_at) "
                "VALUES (1, '2026-08-03', 5, 'active', 0, CURRENT_TIMESTAMP)"
            )

        original_engine = database.engine
        database.engine = engine
        try:
            database._apply_sqlite_interview_session_migration()
        finally:
            database.engine = original_engine

        columns = {column["name"] for column in inspect(engine).get_columns("interview_question_sets")}
        self.assertTrue(set(database.INTERVIEW_QUESTION_SET_COLUMN_DEFINITIONS).issubset(columns))
        with engine.connect() as connection:
            row = connection.exec_driver_sql(
                "SELECT status, started_at, last_active_at, updated_at FROM interview_question_sets WHERE id = 1"
            ).one()
        self.assertEqual(row.status, "in_progress")
        self.assertTrue(all(value is not None for value in row[1:]))

    def test_existing_sqlite_answers_receive_evaluation_status_columns(self) -> None:
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE interview_answers ("
                "id INTEGER PRIMARY KEY, question_set_id INTEGER, question_id VARCHAR(160), attempt_index INTEGER, "
                "answer_text TEXT, answer_source VARCHAR(20), duration_seconds INTEGER, created_at DATETIME, updated_at DATETIME)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE interview_evaluations (id INTEGER PRIMARY KEY, answer_id INTEGER)"
            )
            connection.exec_driver_sql(
                "INSERT INTO interview_answers "
                "(id, question_set_id, question_id, attempt_index, answer_text, answer_source, created_at, updated_at) "
                "VALUES (1, 1, 'q1', 1, 'answer', 'text', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )

        original_engine = database.engine
        database.engine = engine
        try:
            database._apply_sqlite_interview_answer_migration()
        finally:
            database.engine = original_engine

        columns = {column["name"] for column in inspect(engine).get_columns("interview_answers")}
        self.assertTrue(set(database.INTERVIEW_ANSWER_COLUMN_DEFINITIONS).issubset(columns))
        with engine.connect() as connection:
            row = connection.exec_driver_sql(
                "SELECT evaluation_status, evaluation_error FROM interview_answers WHERE id = 1"
            ).one()
        self.assertEqual(row.evaluation_status, "failed")
        self.assertIsNotNone(row.evaluation_error)
