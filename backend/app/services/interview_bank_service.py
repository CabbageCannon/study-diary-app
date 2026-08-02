from __future__ import annotations

import hashlib
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.schemas import InterviewQuestionCatalog, InterviewQuestionSeed, InterviewSource
from app.services.algorithm_catalog_service import CatalogBuildError, read_json


DOMAIN_TOPICS: dict[str, set[str]] = {
    "agent": {
        "agent_architecture",
        "react_pattern",
        "tool_calling",
        "function_calling",
        "mcp",
        "planning",
        "memory",
        "multi_agent",
        "workflow",
        "human_in_the_loop",
        "agent_safety",
        "agent_evaluation",
    },
    "rag": {
        "embedding",
        "chunking",
        "vector_database",
        "retrieval",
        "reranking",
        "hybrid_search",
        "query_rewrite",
        "metadata_filtering",
        "evaluation",
        "hallucination",
    },
    "llm_application": {"tool_calling", "function_calling", "structured_output", "streaming", "model_api"},
    "python": {
        "python_language",
        "type_hints",
        "async_await",
        "asyncio",
        "concurrency",
        "multiprocessing",
        "fastapi",
        "pydantic",
        "dependency_injection",
        "testing",
    },
    "network": {
        "http",
        "https",
        "tcp",
        "dns",
        "websocket",
        "sse",
        "cors",
        "proxy",
        "load_balancing",
        "api_gateway",
    },
    "ai_engineering": {
        "structured_output",
        "streaming",
        "retry",
        "timeout",
        "rate_limit",
        "caching",
        "idempotency",
        "observability",
        "tracing",
        "deployment",
        "docker",
        "security",
        "cost_control",
        "prompt_management",
        "model_routing",
        "fallback",
        "production_incident",
    },
}


def normalize_question(value: str) -> str:
    characters: list[str] = []
    for char in value.lower().strip():
        if char.isspace():
            characters.append(" ")
        elif unicodedata.category(char)[0] in {"L", "N"}:
            characters.append(char)
    return re.sub(r"\s+", " ", "".join(characters)).strip()


def question_hash(value: str) -> str:
    return hashlib.sha256(normalize_question(value).encode("utf-8")).hexdigest()


def load_source_registry(path: Path) -> dict[str, InterviewSource]:
    payload = read_json(path)
    if not isinstance(payload, dict):
        raise CatalogBuildError(["interview_sources.json 必须是对象"])
    sources: dict[str, InterviewSource] = {}
    errors: list[str] = []
    for source_id, source in payload.items():
        try:
            sources[str(source_id)] = InterviewSource(**source)
        except ValidationError as exc:
            errors.append(f"来源 {source_id}: {exc}")
    if errors:
        raise CatalogBuildError(errors)
    return sources


def _resolve_sources(question: InterviewQuestionSeed, registry: dict[str, InterviewSource]) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for source in question.sources:
        if source.source_id:
            registered = registry.get(source.source_id)
            if registered is None:
                raise ValueError(f"未登记的 source_id: {source.source_id}")
            resolved.append(
                {
                    "title": registered.name,
                    "url": registered.url,
                    "source_type": registered.source_type,
                    "license": registered.license,
                    "accessed_at": registered.accessed_at,
                }
            )
            continue
        try:
            resolved.append(InterviewSource(**source.model_dump(exclude={"source_id"}, exclude_none=True)).model_dump())
        except ValidationError as exc:
            raise ValueError(f"内嵌来源无效: {exc}") from exc
    return resolved


def _validate_topic(question: InterviewQuestionSeed) -> None:
    allowed_topics = DOMAIN_TOPICS.get(question.domain, set())
    if question.topic not in allowed_topics:
        raise ValueError(f"domain={question.domain} 不支持 topic={question.topic}")


def find_duplicate_candidates(questions: list[InterviewQuestionSeed], threshold: float = 0.86) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for index, left in enumerate(questions):
        left_normalized = normalize_question(left.question)
        for right in questions[index + 1 :]:
            score = SequenceMatcher(None, left_normalized, normalize_question(right.question)).ratio()
            if score >= threshold:
                candidates.append({"left_id": left.id, "right_id": right.id, "similarity": round(score, 3)})
    return candidates


def build_interview_bank(input_dir: Path, source_registry_path: Path) -> tuple[InterviewQuestionCatalog, dict[str, Any]]:
    registry = load_source_registry(source_registry_path)
    questions: list[InterviewQuestionSeed] = []
    errors: list[str] = []
    input_files = sorted(input_dir.glob("*.json"))
    if not input_files:
        raise CatalogBuildError([f"没有找到分类题库文件: {input_dir}"])

    for path in input_files:
        payload = read_json(path)
        raw_questions = payload.get("questions") if isinstance(payload, dict) else None
        if not isinstance(raw_questions, list):
            errors.append(f"{path}: 必须包含 questions 数组")
            continue
        for index, raw_question in enumerate(raw_questions, start=1):
            try:
                question = InterviewQuestionSeed(**raw_question)
                _validate_topic(question)
                resolved_sources = _resolve_sources(question, registry)
                expanded_payload = question.model_dump()
                expanded_payload["sources"] = resolved_sources
                question = InterviewQuestionSeed(**expanded_payload)
                questions.append(question)
            except (ValidationError, ValueError) as exc:
                errors.append(f"{path.name} 第 {index} 题: {exc}")

    ids = Counter(question.id for question in questions)
    for value, count in ids.items():
        if count > 1:
            errors.append(f"重复题目 ID: {value} ({count} 次)")
    hashes = Counter(question_hash(question.question) for question in questions)
    for value, count in hashes.items():
        if count > 1:
            errors.append(f"重复题目问题哈希: {value} ({count} 次)")
    if errors:
        raise CatalogBuildError(errors)

    catalog = InterviewQuestionCatalog(questions=sorted(questions, key=lambda item: item.id))
    duplicate_candidates = find_duplicate_candidates(catalog.questions)
    by_domain = Counter(question.domain for question in catalog.questions)
    by_difficulty = Counter(question.difficulty for question in catalog.questions)
    by_review_status = Counter(question.review_status for question in catalog.questions)
    report = {
        "total": len(catalog.questions),
        "by_domain": dict(sorted(by_domain.items())),
        "by_difficulty": {difficulty: by_difficulty.get(difficulty, 0) for difficulty in ("easy", "medium", "hard")},
        "pending_count": by_review_status.get("pending", 0),
        "verified_count": by_review_status.get("verified", 0),
        "rejected_count": by_review_status.get("rejected", 0),
        "duplicate_candidates": duplicate_candidates,
        "validation_errors": [],
    }
    return catalog, report
