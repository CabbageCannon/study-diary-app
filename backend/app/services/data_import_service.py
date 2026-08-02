from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.repositories.algorithm_repository import upsert_problem
from app.repositories.interview_repository import upsert_question
from app.schemas import AlgorithmCatalog, InterviewQuestionCatalog, InterviewQuestionSource
from app.services.algorithm_catalog_service import CatalogBuildError, leetcode_cn_url, read_json
from app.services.interview_bank_service import DOMAIN_TOPICS, question_hash


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    dry_run: bool = False
    question_changes: list[dict[str, object]] = field(default_factory=list)

    def record(self, action: str) -> None:
        setattr(self, action, getattr(self, action) + 1)

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def _load_algorithm_catalog(path: Path) -> AlgorithmCatalog:
    try:
        catalog = AlgorithmCatalog(**read_json(path))
    except (CatalogBuildError, ValidationError) as exc:
        raise CatalogBuildError([f"算法题库无效: {exc}"]) from exc
    errors: list[str] = []
    ids = [problem.id for problem in catalog.problems]
    slugs = [problem.slug for problem in catalog.problems]
    if len(ids) != len(set(ids)):
        errors.append("算法题库存在重复 id")
    if len(slugs) != len(set(slugs)):
        errors.append("算法题库存在重复 slug")
    for problem in catalog.problems:
        if problem.url != leetcode_cn_url(problem.slug):
            errors.append(f"算法题 URL 与 slug 不匹配: {problem.id}")
    if errors:
        raise CatalogBuildError(errors)
    return catalog


def _load_interview_catalog(path: Path) -> InterviewQuestionCatalog:
    try:
        catalog = InterviewQuestionCatalog(**read_json(path))
    except (CatalogBuildError, ValidationError) as exc:
        raise CatalogBuildError([f"八股题库无效: {exc}"]) from exc
    errors: list[str] = []
    ids = [question.id for question in catalog.questions]
    hashes = [question_hash(question.question) for question in catalog.questions]
    if len(ids) != len(set(ids)):
        errors.append("八股题库存在重复 id")
    if len(hashes) != len(set(hashes)):
        errors.append("八股题库存在重复问题")
    for question in catalog.questions:
        if question.topic not in DOMAIN_TOPICS[question.domain]:
            errors.append(f"八股题 domain/topic 非法: {question.id}")
        try:
            for source in question.sources:
                InterviewQuestionSource(**source.model_dump(exclude_none=True))
        except ValidationError as exc:
            errors.append(f"八股题来源无效 {question.id}: {exc}")
    if errors:
        raise CatalogBuildError(errors)
    return catalog


def import_algorithms(db: Session, catalog_path: Path, dry_run: bool = False) -> ImportResult:
    catalog = _load_algorithm_catalog(catalog_path)
    result = ImportResult(dry_run=dry_run)
    try:
        for problem in catalog.problems:
            _, action = upsert_problem(db, problem)
            result.record(action)
        db.flush()
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        result.errors += 1
        raise CatalogBuildError([f"算法题导入失败，事务已回滚: {exc}"]) from exc
    return result


def import_interviews(
    db: Session,
    catalog_path: Path,
    dry_run: bool = False,
    *,
    overwrite_review_metadata: bool = False,
) -> ImportResult:
    catalog = _load_interview_catalog(catalog_path)
    result = ImportResult(dry_run=dry_run)
    try:
        for question in catalog.questions:
            _, action, changes = upsert_question(
                db,
                question,
                overwrite_review_metadata=overwrite_review_metadata,
            )
            result.record(action)
            result.question_changes.append({"question_id": question.id, "action": action, **changes})
        db.flush()
        if dry_run:
            db.rollback()
        else:
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        result.errors += 1
        raise CatalogBuildError([f"八股题导入失败，事务已回滚: {exc}"]) from exc
    return result
