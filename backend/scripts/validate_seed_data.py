from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas import AlgorithmCatalog, InterviewQuestionCatalog
from app.services.algorithm_catalog_service import CatalogBuildError, leetcode_cn_url, read_json
from app.services.interview_bank_service import DOMAIN_TOPICS, find_duplicate_candidates, question_hash


def validate_algorithms(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        catalog = AlgorithmCatalog(**read_json(path))
    except (CatalogBuildError, ValidationError) as exc:
        return [f"算法题库无法解析: {exc}"]
    ids = Counter(problem.id for problem in catalog.problems)
    slugs = Counter(problem.slug for problem in catalog.problems)
    for value, count in ids.items():
        if count > 1:
            errors.append(f"算法题 ID 重复: {value}")
    for value, count in slugs.items():
        if count > 1:
            errors.append(f"算法题 slug 重复: {value}")
    for problem in catalog.problems:
        if problem.url != leetcode_cn_url(problem.slug):
            errors.append(f"算法题 URL 与 slug 不匹配: {problem.slug}")
        if not problem.source.name or not problem.source.license:
            errors.append(f"算法题来源或许可证缺失: {problem.id}")
        if not all(item in {"neetcode150", "blind75", "hot100"} for item in problem.source_lists):
            errors.append(f"算法题 source_lists 非法: {problem.id}")
    return errors


def validate_interviews(path: Path) -> tuple[list[str], list[dict[str, object]]]:
    errors: list[str] = []
    try:
        catalog = InterviewQuestionCatalog(**read_json(path))
    except (CatalogBuildError, ValidationError) as exc:
        return [f"八股题库无法解析: {exc}"], []
    ids = Counter(question.id for question in catalog.questions)
    hashes = Counter(question_hash(question.question) for question in catalog.questions)
    for value, count in ids.items():
        if count > 1:
            errors.append(f"八股题 ID 重复: {value}")
    for value, count in hashes.items():
        if count > 1:
            errors.append(f"八股题问题重复: {value}")
    for question in catalog.questions:
        if question.topic not in DOMAIN_TOPICS[question.domain]:
            errors.append(f"八股题 domain/topic 非法: {question.id}")
        if not question.sources:
            errors.append(f"八股题来源缺失: {question.id}")
    return errors, find_duplicate_candidates(catalog.questions)


def main() -> int:
    parser = argparse.ArgumentParser(description="校验本地题库种子数据。")
    parser.add_argument(
        "--algorithms", type=Path, default=BACKEND_DIR / "data" / "algorithms" / "problem_catalog.json"
    )
    parser.add_argument(
        "--interviews", type=Path, default=BACKEND_DIR / "data" / "interview_question_bank.json"
    )
    args = parser.parse_args()

    errors = validate_algorithms(args.algorithms)
    interview_errors, duplicate_candidates = validate_interviews(args.interviews)
    errors.extend(interview_errors)
    if errors:
        print("数据校验失败:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("数据校验通过")
    print(f"疑似重复题: {len(duplicate_candidates)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
