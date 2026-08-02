import json
import tempfile
import unittest
from pathlib import Path

from app.services.algorithm_catalog_service import CatalogBuildError, write_json
from app.services.interview_bank_service import build_interview_bank, find_duplicate_candidates


def question_payload(question_id: str, question: str) -> dict[str, object]:
    return {
        "id": question_id,
        "domain": "python",
        "topic": "asyncio",
        "subtopic": "event_loop",
        "question": question,
        "difficulty": "medium",
        "question_type": "concept_explanation",
        "expected_duration_seconds": 90,
        "tags": ["Python"],
        "reference_points": ["要点一", "要点二", "要点三"],
        "evaluation_rubric": [
            {"point": "核心要点", "weight": 50, "mandatory": True},
            {"point": "补充要点", "weight": 50, "mandatory": False},
        ],
        "common_mistakes": ["错误一", "错误二"],
        "oral_answer_outline": ["开场", "说明"],
        "reference_answer": "这是一个足够长的面试口述答案，用来验证基础 Schema 和构建流程，并确保内容满足面试表达的最小长度要求。",
        "follow_up_questions": ["追问是什么？"],
        "sources": [{"source_id": "python-docs"}],
        "review_status": "pending",
        "verified_by_human": False,
        "quality_score": None,
    }


class InterviewBankTests(unittest.TestCase):
    def test_builder_resolves_sources_and_reports_similar_questions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bank_dir = root / "bank"
            bank_dir.mkdir()
            sources = root / "sources.json"
            write_json(
                sources,
                {
                    "python-docs": {
                        "name": "Python Docs",
                        "url": "https://docs.python.org/3/",
                        "source_type": "official_documentation",
                        "license": "PSF License",
                        "accessed_at": "2026-08-02",
                    }
                },
            )
            write_json(
                bank_dir / "python.json",
                {
                    "questions": [
                        question_payload("python-test-001", "asyncio 中阻塞调用为什么会影响并发？"),
                        question_payload("python-test-002", "asyncio 中阻塞调用为什么会影响并发执行？"),
                    ]
                },
            )

            catalog, report = build_interview_bank(bank_dir, sources)

            self.assertEqual(len(catalog.questions), 2)
            self.assertEqual(catalog.questions[0].sources[0].url, "https://docs.python.org/3/")
            self.assertTrue(report["duplicate_candidates"])
            self.assertTrue(find_duplicate_candidates(catalog.questions))

    def test_builder_rejects_unregistered_source_and_bad_rubric(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            bank_dir = root / "bank"
            bank_dir.mkdir()
            sources = root / "sources.json"
            write_json(sources, {})
            invalid = question_payload("python-test-001", "asyncio 中阻塞调用为什么会影响并发？")
            invalid["sources"] = [{"source_id": "unknown"}]
            invalid["evaluation_rubric"] = [{"point": "错误权重", "weight": 90, "mandatory": True}]
            write_json(bank_dir / "python.json", {"questions": [invalid]})

            with self.assertRaises(CatalogBuildError) as context:
                build_interview_bank(bank_dir, sources)
            self.assertIn("weight 总和必须为 100", str(context.exception))
