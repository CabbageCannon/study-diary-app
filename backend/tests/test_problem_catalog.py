import json
import tempfile
import unittest
from pathlib import Path

from app.services.algorithm_catalog_service import build_problem_catalog, leetcode_cn_url, write_json


class ProblemCatalogTests(unittest.TestCase):
    def test_builds_deterministic_urls_merges_lists_and_reports_unknown_patterns(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / ".problemSiteData.json"
            mapping = root / "topic_mapping.json"
            lists_dir = root / "lists"
            lists_dir.mkdir()
            write_json(
                source,
                [
                    {
                        "problem": "Contains Duplicate",
                        "link": "https://leetcode.com/problems/contains-duplicate/",
                        "difficulty": "Easy",
                        "pattern": "Arrays & Hashing",
                        "neetcode150": True,
                    },
                    {
                        "problem": "Contains Duplicate",
                        "link": "/problems/contains-duplicate/",
                        "difficulty": "easy",
                        "pattern": "Arrays & Hashing",
                        "blind75": True,
                    },
                    {
                        "problem": "Unknown Pattern",
                        "link": "/problems/unknown-pattern/",
                        "difficulty": "medium",
                        "pattern": "Experimental Pattern",
                    },
                ],
            )
            write_json(mapping, {"Arrays & Hashing": {"key": "arrays_hashing", "label": "数组与哈希", "topics": ["数组"]}})
            write_json(
                lists_dir / "hot100.json",
                {"list_id": "hot100", "name": "Hot 100", "source": {}, "problem_slugs": ["contains-duplicate"]},
            )

            catalog, report = build_problem_catalog(source, mapping, lists_dir)

            self.assertEqual(len(catalog.problems), 2)
            duplicate = next(problem for problem in catalog.problems if problem.slug == "contains-duplicate")
            self.assertEqual(duplicate.url, "https://leetcode.cn/problems/contains-duplicate/")
            self.assertEqual(duplicate.source_lists, ["blind75", "hot100", "neetcode150"])
            self.assertEqual(next(problem for problem in catalog.problems if problem.slug == "unknown-pattern").pattern_key, "other")
            self.assertEqual(report["unknown_patterns"], ["Experimental Pattern"])

    def test_slug_normalization_rejects_title_derived_or_invalid_values(self) -> None:
        self.assertEqual(leetcode_cn_url("/two-sum/"), "https://leetcode.cn/problems/two-sum/")
        with self.assertRaises(ValueError):
            leetcode_cn_url("Two Sum")
