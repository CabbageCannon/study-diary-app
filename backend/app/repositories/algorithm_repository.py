from __future__ import annotations

import json

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import AlgorithmProblem
from app.schemas import AlgorithmProblemSeed


def get_by_stable_key(db: Session, stable_key: str) -> AlgorithmProblem | None:
    return db.scalar(select(AlgorithmProblem).where(AlgorithmProblem.stable_key == stable_key))


def get_by_identifier(db: Session, identifier: str) -> AlgorithmProblem | None:
    problem = get_by_stable_key(db, identifier)
    if problem is not None or not identifier.isdigit():
        return problem
    return db.get(AlgorithmProblem, int(identifier))


def get_by_slug(db: Session, slug: str) -> AlgorithmProblem | None:
    return db.scalar(select(AlgorithmProblem).where(AlgorithmProblem.slug == slug))


def list_problems(
    db: Session,
    *,
    difficulty: str | None,
    pattern: str | None,
    topic: str | None,
    source_list: str | None,
    limit: int,
) -> list[AlgorithmProblem]:
    statement: Select[tuple[AlgorithmProblem]] = select(AlgorithmProblem).where(AlgorithmProblem.is_active.is_(True))
    if difficulty:
        statement = statement.where(AlgorithmProblem.difficulty == difficulty)
    if pattern:
        statement = statement.where(AlgorithmProblem.pattern_key == pattern)
    results = list(db.scalars(statement.order_by(AlgorithmProblem.id).limit(limit * 5)).all())
    if topic:
        results = [problem for problem in results if topic in problem.topics]
    if source_list:
        results = [problem for problem in results if source_list in problem.source_lists]
    return results[:limit]


def upsert_problem(db: Session, payload: AlgorithmProblemSeed) -> tuple[AlgorithmProblem, str]:
    problem = get_by_stable_key(db, payload.stable_key)
    if problem is None:
        problem = get_by_slug(db, payload.slug)
    values = {
        "stable_key": payload.stable_key,
        "platform": payload.platform,
        "external_id": payload.external_id,
        "title": payload.title,
        "title_zh": payload.title_zh,
        "slug": payload.slug,
        "url": payload.url,
        "difficulty": payload.difficulty,
        "pattern_key": payload.pattern_key,
        "topics_json": json.dumps(payload.topics, ensure_ascii=False),
        "source_lists_json": json.dumps(payload.source_lists, ensure_ascii=False),
        "source_name": payload.source.name,
        "source_license": payload.source.license,
        "is_active": payload.is_active,
    }
    if problem is None:
        problem = AlgorithmProblem(**values)
        db.add(problem)
        return problem, "created"

    changed = any(getattr(problem, name) != value for name, value in values.items())
    if not changed:
        return problem, "skipped"
    for name, value in values.items():
        setattr(problem, name, value)
    return problem, "updated"
