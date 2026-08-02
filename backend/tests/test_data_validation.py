import json
import tempfile
import unittest
from pathlib import Path

from app.services.algorithm_catalog_service import write_json
from app.services.manifest_service import build_manifest


class DataValidationTests(unittest.TestCase):
    def test_manifest_uses_content_hash_and_record_counts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            data_dir = Path(temporary_directory) / "data"
            (data_dir / "algorithms").mkdir(parents=True)
            write_json(data_dir / "algorithms" / "problem_catalog.json", {"catalog_version": 1, "problems": [{"id": "one"}]})
            write_json(data_dir / "interview_question_bank.json", {"catalog_version": 1, "questions": [{"id": "two"}, {"id": "three"}]})
            write_json(data_dir / "interview_sources.json", {"python-docs": {}})

            first = build_manifest(data_dir)
            write_json(data_dir / "interview_question_bank.json", {"catalog_version": 1, "questions": [{"id": "two"}]})
            second = build_manifest(data_dir)

            self.assertEqual((first["algorithm_count"], first["interview_question_count"]), (1, 2))
            self.assertEqual(second["interview_question_count"], 1)
            self.assertNotEqual(first["files"][1]["sha256"], second["files"][1]["sha256"])
