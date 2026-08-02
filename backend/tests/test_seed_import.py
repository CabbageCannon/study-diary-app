import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base
from app.models import AlgorithmProblem, InterviewQuestion
from app.schemas import AlgorithmCatalog, AlgorithmProblemSeed, InterviewQuestionCatalog, InterviewQuestionSeed
from app.services.algorithm_catalog_service import CatalogBuildError, write_json
from app.services.data_import_service import import_algorithms, import_interviews


def algorithm_payload() -> dict[str, object]:
    return {
        "id": "leetcode-1",
        "platform": "leetcode",
        "external_id": "1",
        "title": "Two Sum",
        "title_zh": None,
        "slug": "two-sum",
        "url": "https://leetcode.cn/problems/two-sum/",
        "difficulty": "easy",
        "pattern_key": "arrays_hashing",
        "topics": ["数组", "哈希表"],
        "source_lists": ["neetcode150"],
        "is_active": True,
        "source": {"name": "neetcode-gh/leetcode", "license": "MIT", "url": "https://github.com/neetcode-gh/leetcode"},
    }


def interview_payload() -> dict[str, object]:
    return {
        "id": "python-import-001",
        "domain": "python",
        "topic": "asyncio",
        "subtopic": "event_loop",
        "question": "asyncio 中阻塞调用为什么会影响并发？",
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
        "reference_answer": "这是一个足够长的面试口述答案，用来验证基础 Schema 和导入流程，并确保内容满足面试表达的最小长度要求。",
        "follow_up_questions": ["追问是什么？"],
        "sources": [
            {
                "title": "Python Docs",
                "url": "https://docs.python.org/3/",
                "source_type": "official_documentation",
                "license": "PSF License",
                "accessed_at": "2026-08-02",
            }
        ],
        "review_status": "pending",
        "verified_by_human": False,
        "quality_score": None,
    }


class SeedImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.session.close()
        self.temporary_directory.cleanup()

    def test_repeated_import_is_idempotent_and_dry_run_does_not_write(self) -> None:
        algorithms = self.root / "algorithms.json"
        interviews = self.root / "interviews.json"
        write_json(algorithms, AlgorithmCatalog(problems=[AlgorithmProblemSeed(**algorithm_payload())]).model_dump(mode="json"))
        write_json(interviews, InterviewQuestionCatalog(questions=[InterviewQuestionSeed(**interview_payload())]).model_dump(mode="json"))

        first_algorithm = import_algorithms(self.session, algorithms)
        first_interview = import_interviews(self.session, interviews)
        second_algorithm = import_algorithms(self.session, algorithms)
        second_interview = import_interviews(self.session, interviews)

        self.assertEqual((first_algorithm.created, first_interview.created), (1, 1))
        self.assertEqual((second_algorithm.skipped, second_interview.skipped), (1, 1))
        self.assertEqual(len(self.session.scalars(select(AlgorithmProblem)).all()), 1)
        self.assertEqual(len(self.session.scalars(select(InterviewQuestion)).all()), 1)

        self.assertEqual(import_algorithms(self.session, algorithms, dry_run=True).skipped, 1)
        self.assertEqual(len(self.session.scalars(select(AlgorithmProblem)).all()), 1)

    def test_database_error_rolls_back_transaction(self) -> None:
        algorithms = self.root / "algorithms.json"
        write_json(algorithms, AlgorithmCatalog(problems=[AlgorithmProblemSeed(**algorithm_payload())]).model_dump(mode="json"))
        with patch("app.services.data_import_service.upsert_problem", side_effect=IntegrityError("insert", {}, Exception("broken"))):
            with self.assertRaises(CatalogBuildError):
                import_algorithms(self.session, algorithms)
        self.assertEqual(len(self.session.scalars(select(AlgorithmProblem)).all()), 0)
