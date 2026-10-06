import unittest

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import _normalize_sqlite_url
from app.main import app
from app.security import is_ai_request
from scripts.migrate_sqlite_to_postgres import integer_primary_key_columns, postgres_url


class ProductionReadinessTests(unittest.TestCase):
    def test_postgres_urls_use_psycopg_driver(self) -> None:
        self.assertEqual(
            _normalize_sqlite_url("postgresql://user:password@db.example/study_diary"),
            "postgresql+psycopg://user:password@db.example/study_diary",
        )
        self.assertEqual(
            postgres_url("postgres://user:password@db.example/study_diary"),
            "postgresql+psycopg://user:password@db.example/study_diary",
        )

    def test_sqlite_migration_finds_generated_integer_primary_keys(self) -> None:
        keys = {(table.name, column.name) for table, column in integer_primary_key_columns()}
        self.assertIn(("diaries", "id"), keys)
        self.assertIn(("algorithm_reasoning_answers", "id"), keys)
        self.assertNotIn(("interview_questions", "id"), keys)

    def test_health_is_public_and_personal_api_requires_login(self) -> None:
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/health", headers={"Authorization": ""}).status_code, 200)
            response = client.get("/api/diaries", headers={"Authorization": ""})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["detail"], "请先登录。")

    def test_algorithm_hint_is_treated_as_an_ai_request(self) -> None:
        request = Request({"type": "http", "method": "POST", "path": "/api/algorithms/attempts/1/hint", "headers": []})
        self.assertTrue(is_ai_request(request))
