from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas import InterviewQuestionCatalog
from app.services.algorithm_catalog_service import CatalogBuildError, read_json, write_json
from app.services.interview_bank_service import question_hash


def build_report(catalog: InterviewQuestionCatalog) -> dict[str, object]:
    hashes: dict[str, int] = {}
    for question in catalog.questions:
        value = question_hash(question.question)
        hashes[value] = hashes.get(value, 0) + 1

    questions: list[dict[str, object]] = []
    for question in catalog.questions:
        rubric_valid = sum(item.weight for item in question.evaluation_rubric) == 100
        has_specific_source = bool(question.sources) and all(
            bool(source.url and (source.title or source.source_id)) for source in question.sources
        )
        possible_factual_risk = not has_specific_source or hashes[question_hash(question.question)] > 1
        notes: list[str] = []
        if possible_factual_risk:
            notes.append("来源或题目唯一性需要人工复核。")
        if question.review_status != "pending":
            notes.append("该报告不修改数据库审核状态，请单独确认现有状态。")
        questions.append(
            {
                "id": question.id,
                "recommended_status": "pending",
                "quality_checks": {
                    "has_specific_source": has_specific_source,
                    "rubric_valid": rubric_valid,
                    "reference_points_valid": len(question.reference_points) >= 3,
                    "common_mistakes_valid": len(question.common_mistakes) >= 2,
                    "answer_length_valid": 40 <= len(question.reference_answer) <= 1200,
                    "question_hash_unique": hashes[question_hash(question.question)] == 1,
                    "possible_factual_risk": possible_factual_risk,
                },
                "notes": notes,
            }
        )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(questions),
        "note": "自动质量检查不能替代人工审核；本报告不会把任何题目改为 verified。",
        "questions": questions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="生成八股题人工审核建议报告，不修改题库或数据库。")
    parser.add_argument(
        "--input",
        type=Path,
        default=BACKEND_DIR / "data" / "interview_question_bank.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BACKEND_DIR / "data" / "interview_manual_review_report.json",
    )
    args = parser.parse_args()
    try:
        catalog = InterviewQuestionCatalog(**read_json(args.input))
    except (CatalogBuildError, ValueError) as exc:
        print(f"报告生成失败: {exc}", file=sys.stderr)
        return 1
    report = build_report(catalog)
    write_json(args.output, report)
    print(f"已生成 {report['total']} 道题的人工审核建议报告: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
