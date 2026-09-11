import tempfile
import unittest
from asyncio import run
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.database import Base, get_db
from app.llm import LLMError, generate_algorithm_reasoning_feedback
from app.main import app
from app.models import AlgorithmAttempt, AlgorithmProblemContext, AlgorithmProblemProgress
from app.schemas import AlgorithmReasoningAnswerCreate, AlgorithmReasoningFeedbackModel
from app.security import is_ai_request
from app.services.algorithm_catalog_service import read_json, write_json
from app.services.algorithm_reasoning_service import check_saved_reasoning_answer, save_reasoning_answer
from app.services.data_import_service import import_algorithms, import_mobile_problem_contexts


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "algorithms" / "problem_catalog.json"
REAL_CONTEXTS_DIR = Path(__file__).resolve().parents[1] / "data" / "mobile" / "algorithm_contexts"


def context_payload(problem_key: str = "leetcode-1") -> dict[str, object]:
    return {
        "schema_version": 1,
        "problem_key": problem_key,
        "title": "Two Sum",
        "title_zh": "两数之和",
        "statement_zh": "给定整数数组和目标值，找出两个不同下标，使两个数之和等于目标值，并返回这两个下标。",
        "input_output": {"input": "整数数组 nums 和整数 target", "output": "两个不同下标，顺序不限"},
        "constraints": ["数组长度至少为 2", "恰好存在一个答案", "同一元素不能使用两次"],
        "examples": [
            {"input": "nums = [3, 2, 4], target = 6", "output": "[1, 2]", "explanation": "不能把下标 0 的 3 用两次"},
        ],
        "verification_points": [
            {
                "id": "vp-lookup-before-store",
                "kind": "key_insight",
                "statement": "哈希表方案应先查补数再存当前值，或明确保证两个下标不同",
                "required": True,
                "acceptable_variants": ["暴力枚举所有不同下标也正确"],
            },
            {
                "id": "vp-complexity",
                "kind": "complexity",
                "statement": "哈希方案时间 O(n)，空间 O(n)",
                "required": False,
                "acceptable_variants": [],
            },
        ],
        "acceptable_approaches": [
            {
                "name": "哈希表一次遍历",
                "idea": "遍历时先查 target - x 是否已见过，再存当前值到下标",
                "time_complexity": "O(n)",
                "space_complexity": "O(n)",
                "is_reference": True,
                "note": None,
            },
            {
                "name": "暴力双循环",
                "idea": "枚举两个不同下标并检查和",
                "time_complexity": "O(n^2)",
                "space_complexity": "O(1)",
                "is_reference": False,
                "note": "正确但非最优",
            },
        ],
        "common_mistakes": [
            {"description": "把同一个元素使用两次", "counterexample": "nums = [3, 2, 4], target = 6"},
        ],
        "edge_cases": [{"description": "重复元素", "expected_handling": "允许两个不同位置的相同值"}],
        "source": {
            "name": "LeetCode CN 1. 两数之和",
            "url": "https://leetcode.cn/problems/two-sum/",
            "license_note": "题意为原创中文转写，未复制外站题面/题解",
            "source_version": "2026-09-06 测试样例",
        },
        "content_notes": None,
        "content_status": "ready",
    }


def feedback(
    conclusion: str,
    *,
    headline: str | None = None,
    needs_review: bool | None = None,
) -> AlgorithmReasoningFeedbackModel:
    issues = []
    counterexample = {"kind": "none", "content": None}
    followup = None
    sufficient = conclusion != "insufficient_context"
    if conclusion == "partially_correct":
        issues = [{"type": "missing", "detail": "没有说明先查补数再存当前值。", "quote": None, "verification_point_id": "vp-lookup-before-store"}]
        counterexample = {"kind": "followup", "content": "如果 nums=[3,3]，target=6，你会在什么时候存第一个 3？"}
        followup = "补充查找和写入哈希表的顺序。"
    elif conclusion == "critical_error":
        issues = [{"type": "key_error", "detail": "排序双指针会丢失原始下标。", "quote": "排序后双指针", "verification_point_id": None}]
        counterexample = {"kind": "counterexample", "content": "nums=[3,2,4] 排序后下标已改变。"}
    elif conclusion == "insufficient_context":
        issues = [{"type": "unclear", "detail": "只说用哈希，没有说明存什么或如何返回下标。", "quote": "用哈希", "verification_point_id": None}]
        counterexample = {"kind": "followup", "content": "请说明哈希表的键和值分别是什么。"}
        followup = "请补充哈希表存储内容和返回条件。"
    return AlgorithmReasoningFeedbackModel(
        conclusion=conclusion,  # type: ignore[arg-type]
        context_sufficient=sufficient,
        headline=headline or {
            "correct": "思路成立，哈希表一次遍历可以解决本题。",
            "partially_correct": "方向成立，但还需要说明避免复用同一元素。",
            "critical_error": "存在关键错误，排序后不能直接返回原下标。",
            "insufficient_context": "信息不足，需要补充哈希表如何使用。",
        }[conclusion],
        correct_parts=[{"point": "提到了哈希表降低查找成本", "quote": "哈希表"}] if conclusion != "critical_error" else [],
        issues_or_missing=issues,  # type: ignore[arg-type]
        counterexample_or_followup=counterexample,  # type: ignore[arg-type]
        complexity={
            "time": {"user_claim": "O(n)", "assessment": "correct", "expected": "O(n)", "note": "一次遍历"},
            "space": {"user_claim": "O(n)", "assessment": "correct", "expected": "O(n)", "note": "哈希表"},
        },
        alternative_approaches_accepted=[],
        reference_outline="先查补数，未命中再存当前值。",
        needs_review=needs_review if needs_review is not None else conclusion != "correct",
        followup_for_supplement=followup,
    )


async def llm_correct(*_args: object, **_kwargs: object) -> AlgorithmReasoningFeedbackModel:
    return feedback("correct", needs_review=False)


async def llm_partial(*_args: object, **_kwargs: object) -> AlgorithmReasoningFeedbackModel:
    return feedback("partially_correct")


async def llm_error(*_args: object, **_kwargs: object) -> AlgorithmReasoningFeedbackModel:
    return feedback("critical_error")


async def llm_insufficient(*_args: object, **_kwargs: object) -> AlgorithmReasoningFeedbackModel:
    return feedback("insufficient_context")


async def llm_failure(*_args: object, **_kwargs: object) -> AlgorithmReasoningFeedbackModel:
    raise RuntimeError("simulated timeout")


class MobileAlgorithmReasoningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        import_algorithms(self.session, CATALOG_PATH)
        self.tempdir = tempfile.TemporaryDirectory()
        self.context_dir = Path(self.tempdir.name)
        write_json(self.context_dir / "leetcode-1.json", context_payload())
        import_mobile_problem_contexts(self.session, self.context_dir)

        def override_db():
            yield self.session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.client.close()
        self.session.close()
        self.tempdir.cleanup()

    def payload(self, **updates: object) -> dict[str, object]:
        data: dict[str, object] = {
            "problem_id": "leetcode-1",
            "answer_text": "用哈希表存已经见过的数，遍历时查 target - 当前值。",
            "answer_source": "text",
            "client_answer_id": str(uuid4()),
            "details": {"time_complexity": "O(n)", "space_complexity": "O(n)"},
        }
        data.update(updates)
        return data

    def test_context_import_is_versioned_and_exposed_by_problem_key(self) -> None:
        response = self.client.get("/api/algorithms/problems/leetcode-1/reasoning-context")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["reasoning_available"])
        self.assertEqual(body["context"]["content_version"], 1)

        write_json(self.context_dir / "leetcode-1.json", context_payload())
        second = import_mobile_problem_contexts(self.session, self.context_dir)
        self.assertEqual(second.skipped, 1)

        changed = context_payload()
        changed["statement_zh"] = "给定整数数组和目标值，返回两个不同下标，使对应数字之和等于目标值。"
        write_json(self.context_dir / "leetcode-1.json", changed)
        third = import_mobile_problem_contexts(self.session, self.context_dir)
        self.assertEqual(third.created, 1)
        current = self.client.get("/api/algorithms/problems/leetcode-1/reasoning-context").json()
        self.assertEqual(current["context"]["content_version"], 2)
        self.assertEqual(self.session.query(AlgorithmProblemContext).count(), 2)

    def test_real_active_catalog_contexts_include_recommended_problem_and_can_check(self) -> None:
        active_ids = {problem["id"] for problem in read_json(CATALOG_PATH)["problems"] if problem["is_active"]}
        context_ids = {path.stem for path in REAL_CONTEXTS_DIR.glob("*.json")}
        self.assertFalse(active_ids - context_ids)

        import_mobile_problem_contexts(self.session, REAL_CONTEXTS_DIR)
        response = self.client.get("/api/algorithms/problems/leetcode-49/reasoning-context")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["reasoning_available"])

        answer, created = save_reasoning_answer(
            self.session,
            AlgorithmReasoningAnswerCreate.model_validate(
                self.payload(
                    problem_id="leetcode-49",
                    answer_text="把每个字符串转成 26 个字母计数元组作为 key，用哈希表收集同 key 的原字符串。",
                )
            ),
        )
        self.assertTrue(created)
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_correct):
            checked = run(check_saved_reasoning_answer(self.session, answer.id))
        self.assertEqual(checked.check_status, "completed")
        self.assertEqual(checked.problem_context.problem_id, "leetcode-49")

    def test_context_missing_returns_200_without_llm_claim(self) -> None:
        response = self.client.get("/api/algorithms/problems/leetcode-15/reasoning-context")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["reasoning_available"])
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_correct):
            checked = self.client.post("/api/algorithms/reasoning/checks", json=self.payload(problem_id="leetcode-15"))
        self.assertEqual(checked.status_code, 201, checked.text)
        self.assertEqual(checked.json()["check_status"], "context_unavailable")
        self.assertIsNone(checked.json()["feedback"])

    def test_check_accepts_correct_partial_error_and_insufficient_results(self) -> None:
        scenarios = [
            (llm_correct, "correct", 201),
            (llm_partial, "partially_correct", 201),
            (llm_error, "critical_error", 201),
            (llm_insufficient, "insufficient_context", 201),
        ]
        for generator, conclusion, expected_status in scenarios:
            with self.subTest(conclusion=conclusion):
                with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", generator):
                    response = self.client.post("/api/algorithms/reasoning/checks", json=self.payload())
                self.assertEqual(response.status_code, expected_status, response.text)
                body = response.json()
                self.assertEqual(body["save_status"], "saved")
                self.assertEqual(body["check_status"], "completed")
                self.assertEqual(body["feedback"]["conclusion"], conclusion)
                if conclusion == "insufficient_context":
                    self.assertFalse(body["feedback"]["context_sufficient"])

    def test_reasoning_accuracy_score_is_validated_and_old_feedback_gets_fallback(self) -> None:
        old_feedback = AlgorithmReasoningFeedbackModel.model_validate(
            {
                "conclusion": "partially_correct",
                "context_sufficient": True,
                "headline": "方向成立，但缺少关键条件。",
                "correct_parts": [{"point": "使用哈希表", "quote": None}],
                "issues_or_missing": [{"type": "missing", "detail": "缺少先查后存。", "quote": None, "verification_point_id": None}],
                "counterexample_or_followup": {"kind": "followup", "content": "如何避免复用同一位置？"},
                "complexity": {
                    "time": {"user_claim": None, "assessment": "not_stated", "expected": "O(n)", "note": None},
                    "space": {"user_claim": None, "assessment": "not_stated", "expected": "O(n)", "note": None},
                },
                "alternative_approaches_accepted": [],
                "reference_outline": "先查补数，再存当前值。",
                "needs_review": True,
                "followup_for_supplement": "补充哈希表更新顺序。",
            }
        )
        self.assertEqual(old_feedback.accuracy_score, 65)

        payload = old_feedback.model_dump()
        payload["accuracy_score"] = 101
        with self.assertRaises(ValidationError):
            AlgorithmReasoningFeedbackModel.model_validate(payload)

    def test_llm_failure_keeps_saved_answer_and_recheck_does_not_duplicate_save(self) -> None:
        payload = self.payload(client_answer_id=str(uuid4()))
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_failure):
            failed = self.client.post("/api/algorithms/reasoning/checks", json=payload)
        self.assertEqual(failed.status_code, 201, failed.text)
        body = failed.json()
        self.assertEqual(body["save_status"], "saved")
        self.assertEqual(body["check_status"], "failed")
        self.assertIsNotNone(body["retry"])
        answer_id = body["answer"]["answer_id"]

        restored = self.client.get(f"/api/algorithms/reasoning/answers?client_answer_id={payload['client_answer_id']}")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()[0]["answer"]["answer_id"], answer_id)

        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_correct):
            retried = self.client.post(f"/api/algorithms/reasoning/answers/{answer_id}/check", json={})
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual(retried.json()["feedback"]["conclusion"], "correct")
        self.assertEqual(self.session.query(AlgorithmAttempt).count(), 1)

    def test_idempotent_check_and_conflict_for_same_client_id_different_content(self) -> None:
        payload = self.payload(client_answer_id=str(uuid4()))
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_correct):
            first = self.client.post("/api/algorithms/reasoning/checks", json=payload)
            second = self.client.post("/api/algorithms/reasoning/checks", json=payload)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["answer"]["answer_id"], second.json()["answer"]["answer_id"])
        self.assertEqual(self.session.query(AlgorithmAttempt).count(), 1)

        changed = dict(payload)
        changed["answer_text"] = "我修改了回答，但错误复用了旧 UUID。"
        conflict = self.client.post("/api/algorithms/reasoning/checks", json=changed)
        self.assertEqual(conflict.status_code, 409)

    def test_revision_has_new_version_and_does_not_reuse_old_feedback(self) -> None:
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_partial):
            first = self.client.post("/api/algorithms/reasoning/checks", json=self.payload())
        first_id = first.json()["answer"]["answer_id"]
        revision_payload = self.payload(
            revision_of_answer_id=first_id,
            answer_text="补充：遍历时先查补数是否已存在，再存当前值，所以不会复用同一位置。",
        )
        with patch("app.services.algorithm_reasoning_service.generate_algorithm_reasoning_feedback", llm_correct):
            revision = self.client.post("/api/algorithms/reasoning/checks", json=revision_payload)
        self.assertEqual(revision.status_code, 201, revision.text)
        body = revision.json()
        self.assertEqual(body["answer"]["version"], 2)
        self.assertEqual(body["answer"]["revision_of_answer_id"], first_id)
        self.assertEqual(body["feedback"]["conclusion"], "correct")
        restored_first = self.client.get(f"/api/algorithms/reasoning/answers/{first_id}").json()
        self.assertEqual(restored_first["feedback"]["conclusion"], "partially_correct")

    def test_save_validation_failure_returns_protocol_envelope(self) -> None:
        response = self.client.post("/api/algorithms/reasoning/checks", json=self.payload(answer_text="   "))
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["save_status"], "save_failed")
        self.assertEqual(response.json()["check_status"], "not_attempted")

    def test_old_sqlite_create_all_can_add_new_tables(self) -> None:
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            self.assertEqual(session.query(AlgorithmProblemContext).count(), 0)

    def test_reasoning_save_is_not_ai_limited_but_checks_are(self) -> None:
        save_request = Request({"type": "http", "method": "POST", "path": "/api/algorithms/reasoning/answers", "headers": []})
        check_request = Request({"type": "http", "method": "POST", "path": "/api/algorithms/reasoning/checks", "headers": []})
        recheck_request = Request({"type": "http", "method": "POST", "path": "/api/algorithms/reasoning/answers/1/check", "headers": []})
        self.assertFalse(is_ai_request(save_request))
        self.assertTrue(is_ai_request(check_request))
        self.assertTrue(is_ai_request(recheck_request))

    def test_malformed_llm_reasoning_output_fails_after_repair_attempt(self) -> None:
        async def bad_json(*_args: object, **_kwargs: object) -> tuple[dict[str, object], str]:
            return {"headline": "缺少关键字段"}, "{}"

        class SavedAnswer:
            answer_text = "用哈希表。"
            details: dict[str, object] = {}
            version = 1

        with patch("app.llm._request_json_content", bad_json):
            with self.assertRaises(LLMError):
                run(
                    generate_algorithm_reasoning_feedback(
                        context=context_payload(),
                        answer=SavedAnswer(),
                        previous_feedback=None,
                    )
                )


if __name__ == "__main__":
    unittest.main()
