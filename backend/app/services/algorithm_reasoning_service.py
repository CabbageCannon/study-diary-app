from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.llm import generate_algorithm_reasoning_feedback
from app.models import (
    AlgorithmAttempt,
    AlgorithmPracticeSessionItem,
    AlgorithmProblem,
    AlgorithmProblemContext,
    AlgorithmReasoningAnswer,
    AlgorithmReasoningFeedback,
)
from app.repositories.algorithm_practice_repository import get_session, get_session_item
from app.repositories.algorithm_repository import get_by_identifier
from app.schemas import (
    AlgorithmProblemContextRead,
    AlgorithmProblemContextSeed,
    AlgorithmProblemReasoningContextResponse,
    AlgorithmReasoningAnswerCreate,
    AlgorithmReasoningAnswerDetailRead,
    AlgorithmReasoningAnswerRead,
    AlgorithmReasoningCheckResponse,
    AlgorithmReasoningFeedbackModel,
    AlgorithmReasoningFeedbackRead,
    AlgorithmReasoningProblemContextSummary,
    AlgorithmReasoningRetry,
)
from app.services.algorithm_catalog_service import CatalogBuildError, read_json
from app.services.algorithm_practice_service import _sync_progress_and_review, utc_now


PROMPT_VERSION = "reasoning-check-v1"
CONCLUSION_TO_ATTEMPT_RESULT = {
    "correct": "solved",
    "partially_correct": "partially_solved",
    "critical_error": "failed",
}
ANSWERED_ITEM_STATUSES = {"solved", "needs_review"}


class AlgorithmReasoningError(ValueError):
    pass


class AlgorithmReasoningConflict(AlgorithmReasoningError):
    pass


class AlgorithmReasoningNotFound(AlgorithmReasoningError):
    pass


@dataclass
class MobileContextImportResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: int = 0
    dry_run: bool = False
    changes: list[dict[str, object]] = field(default_factory=list)

    def record(self, action: str, problem_key: str, content_version: int | None = None) -> None:
        setattr(self, action, getattr(self, action) + 1)
        payload: dict[str, object] = {"problem_key": problem_key, "action": action}
        if content_version is not None:
            payload["content_version"] = content_version
        self.changes.append(payload)

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def _canonical_json(data: dict[str, object]) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _content_hash(context: AlgorithmProblemContextSeed) -> str:
    payload = context.model_dump(mode="json", exclude_none=True)
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _current_context(db: Session, problem_id: int) -> AlgorithmProblemContext | None:
    return db.scalar(
        select(AlgorithmProblemContext)
        .where(
            AlgorithmProblemContext.problem_id == problem_id,
            AlgorithmProblemContext.content_status == "ready",
            AlgorithmProblemContext.is_current.is_(True),
        )
        .order_by(AlgorithmProblemContext.content_version.desc())
    )


def _context_read(record: AlgorithmProblemContext) -> AlgorithmProblemContextRead:
    payload = dict(record.context)
    payload["content_version"] = record.content_version
    payload["content_hash"] = record.content_hash
    payload["content_updated_at"] = record.content_updated_at
    return AlgorithmProblemContextRead.model_validate(payload)


def _details_json(payload: AlgorithmReasoningAnswerCreate) -> str:
    return payload.details.model_dump_json(exclude_none=True)


def _details_dict(answer: AlgorithmReasoningAnswer) -> dict[str, object]:
    return answer.details


def _feedback_for_answer(db: Session, answer_id: int) -> AlgorithmReasoningFeedback | None:
    return db.scalar(select(AlgorithmReasoningFeedback).where(AlgorithmReasoningFeedback.answer_id == answer_id))


def _answer_check_status(db: Session, answer: AlgorithmReasoningAnswer) -> str:
    return "completed" if _feedback_for_answer(db, answer.id) is not None else "not_attempted"


def _answer_read(db: Session, answer: AlgorithmReasoningAnswer) -> AlgorithmReasoningAnswerRead:
    problem = db.get(AlgorithmProblem, answer.problem_id)
    return AlgorithmReasoningAnswerRead(
        answer_id=answer.id,
        problem_id=problem.stable_key if problem else str(answer.problem_id),
        session_id=answer.session_id,
        version=answer.version,
        revision_of_answer_id=answer.revision_of_answer_id,
        answer_text=answer.answer_text,
        answer_source=answer.answer_source,  # type: ignore[arg-type]
        details=_details_dict(answer),
        client_answer_id=answer.client_answer_id,
        check_status=_answer_check_status(db, answer),  # type: ignore[arg-type]
        saved_at=answer.saved_at,
        checked_at=answer.checked_at,
    )


def _feedback_read(feedback: AlgorithmReasoningFeedback) -> AlgorithmReasoningFeedbackRead:
    payload = dict(feedback.feedback)
    payload.update(
        {
            "feedback_id": feedback.id,
            "answer_id": feedback.answer_id,
            "model_name": feedback.model_name,
            "prompt_version": feedback.prompt_version,
            "context_version": feedback.context_version,
            "created_at": feedback.created_at,
        }
    )
    return AlgorithmReasoningFeedbackRead.model_validate(payload)


def _problem_summary(problem: AlgorithmProblem, context: AlgorithmProblemContext | None) -> AlgorithmReasoningProblemContextSummary:
    return AlgorithmReasoningProblemContextSummary(
        problem_id=problem.stable_key,
        content_version=context.content_version if context else None,
        reasoning_available=context is not None,
    )


def _envelope(
    db: Session,
    answer: AlgorithmReasoningAnswer,
    *,
    check_status: str,
    check_error: str | None = None,
    context: AlgorithmProblemContext | None = None,
) -> AlgorithmReasoningCheckResponse:
    problem = db.get(AlgorithmProblem, answer.problem_id)
    feedback = _feedback_for_answer(db, answer.id)
    return AlgorithmReasoningCheckResponse(
        save_status="saved",
        check_status=check_status,  # type: ignore[arg-type]
        answer=_answer_read(db, answer),
        feedback=_feedback_read(feedback) if feedback else None,
        check_error=check_error,
        retry=AlgorithmReasoningRetry(check_url=f"/api/algorithms/reasoning/answers/{answer.id}/check")
        if check_status == "failed"
        else None,
        problem_context=_problem_summary(problem, context) if problem else None,
    )


def _ensure_problem(db: Session, identifier: str) -> AlgorithmProblem:
    problem = get_by_identifier(db, identifier)
    if problem is None or not problem.is_active:
        raise AlgorithmReasoningNotFound("算法题不存在或不可用。")
    return problem


def _ensure_session_problem(
    db: Session,
    session_id: str | None,
    problem: AlgorithmProblem,
) -> AlgorithmPracticeSessionItem | None:
    if not session_id:
        return None
    session = get_session(db, session_id)
    if session is None:
        raise AlgorithmReasoningConflict("训练会话不存在或已删除。")
    item = get_session_item(db, session.id, problem.id)
    if item is None:
        raise AlgorithmReasoningConflict("该题目不属于当前训练会话。")
    return item


def _next_version(db: Session, problem_id: int, session_id: str | None, revision_of_answer_id: int | None) -> int:
    if revision_of_answer_id is None:
        return 1
    previous = db.get(AlgorithmReasoningAnswer, revision_of_answer_id)
    if previous is None:
        raise AlgorithmReasoningConflict("修订来源回答不存在。")
    if previous.problem_id != problem_id or previous.session_id != session_id:
        raise AlgorithmReasoningConflict("修订来源必须属于同一道题和同一个训练会话。")
    return previous.version + 1


def _assert_idempotent_match(
    db: Session,
    existing: AlgorithmReasoningAnswer,
    payload: AlgorithmReasoningAnswerCreate,
) -> None:
    problem = _ensure_problem(db, payload.problem_id)
    expected = {
        "problem_id": problem.id,
        "session_id": payload.session_id,
        "revision_of_answer_id": payload.revision_of_answer_id,
        "answer_text": payload.answer_text,
        "answer_source": payload.answer_source,
        "details_json": _details_json(payload),
    }
    for field_name, value in expected.items():
        if getattr(existing, field_name) != value:
            raise AlgorithmReasoningConflict("client_answer_id 已存在，但提交内容与已保存回答不一致。请为修改后的回答生成新的 UUID。")


def _mark_session_item_answered(db: Session, item: AlgorithmPracticeSessionItem | None, now) -> bool:
    if item is None or item.status in ANSWERED_ITEM_STATUSES:
        return False
    item.status = "needs_review"
    item.started_at = item.started_at or now
    item.completed_at = item.completed_at or now
    if item.session_id and (session := get_session(db, item.session_id)):
        session.last_active_at = now
    return True


def save_reasoning_answer(db: Session, payload: AlgorithmReasoningAnswerCreate) -> tuple[AlgorithmReasoningAnswer, bool]:
    existing = db.scalar(
        select(AlgorithmReasoningAnswer).where(AlgorithmReasoningAnswer.client_answer_id == payload.client_answer_id)
    )
    if existing is not None:
        _assert_idempotent_match(db, existing, payload)
        item = db.get(AlgorithmPracticeSessionItem, existing.session_item_id) if existing.session_item_id else None
        if _mark_session_item_answered(db, item, existing.saved_at):
            db.commit()
        return existing, False

    problem = _ensure_problem(db, payload.problem_id)
    session_item = _ensure_session_problem(db, payload.session_id, problem)
    version = _next_version(db, problem.id, payload.session_id, payload.revision_of_answer_id)
    now = utc_now()
    answer = AlgorithmReasoningAnswer(
        problem_id=problem.id,
        session_id=payload.session_id,
        session_item_id=session_item.id if session_item else None,
        version=version,
        revision_of_answer_id=payload.revision_of_answer_id,
        answer_text=payload.answer_text,
        answer_source=payload.answer_source,
        details_json=_details_json(payload),
        client_answer_id=payload.client_answer_id,
        saved_at=now,
    )
    db.add(answer)
    _mark_session_item_answered(db, session_item, now)
    db.commit()
    db.refresh(answer)
    return answer, True


def get_problem_reasoning_context(db: Session, problem_identifier: str) -> AlgorithmProblemReasoningContextResponse:
    problem = _ensure_problem(db, problem_identifier)
    context = _current_context(db, problem.id)
    return AlgorithmProblemReasoningContextResponse(
        problem_id=problem.stable_key,
        reasoning_available=context is not None,
        context=_context_read(context) if context else None,
    )


def get_answer_detail(db: Session, answer_id: int) -> AlgorithmReasoningAnswerDetailRead:
    answer = db.get(AlgorithmReasoningAnswer, answer_id)
    if answer is None:
        raise AlgorithmReasoningNotFound("回答不存在。")
    feedback = _feedback_for_answer(db, answer.id)
    return AlgorithmReasoningAnswerDetailRead(
        answer=_answer_read(db, answer),
        feedback=_feedback_read(feedback) if feedback else None,
    )


def list_reasoning_answers(
    db: Session,
    *,
    problem_identifier: str | None,
    session_id: str | None,
    client_answer_id: str | None,
    limit: int,
) -> list[AlgorithmReasoningAnswerDetailRead]:
    statement = select(AlgorithmReasoningAnswer)
    if problem_identifier:
        problem = _ensure_problem(db, problem_identifier)
        statement = statement.where(AlgorithmReasoningAnswer.problem_id == problem.id)
    if session_id:
        statement = statement.where(AlgorithmReasoningAnswer.session_id == session_id)
    if client_answer_id:
        statement = statement.where(AlgorithmReasoningAnswer.client_answer_id == client_answer_id)
    answers = list(db.scalars(statement.order_by(AlgorithmReasoningAnswer.saved_at.desc(), AlgorithmReasoningAnswer.id.desc()).limit(limit)).all())
    return [get_answer_detail(db, answer.id) for answer in answers]


def _previous_feedback(db: Session, answer: AlgorithmReasoningAnswer) -> AlgorithmReasoningFeedback | None:
    if answer.revision_of_answer_id is None:
        return None
    return _feedback_for_answer(db, answer.revision_of_answer_id)


def _sync_feedback_progress(db: Session, answer: AlgorithmReasoningAnswer, feedback: AlgorithmReasoningFeedback) -> None:
    if feedback.synced_attempt_id is not None or feedback.conclusion == "insufficient_context":
        return
    result = CONCLUSION_TO_ATTEMPT_RESULT[feedback.conclusion]
    now = utc_now()
    details = answer.details
    attempt = AlgorithmAttempt(
        problem_id=answer.problem_id,
        session_id=answer.session_id,
        session_item_id=answer.session_item_id,
        started_at=now - timedelta(seconds=0),
        submitted_at=now,
        duration_seconds=None,
        result=result,
        language=None,
        approach=answer.answer_text,
        time_complexity=details.get("time_complexity") if isinstance(details.get("time_complexity"), str) else None,
        space_complexity=details.get("space_complexity") if isinstance(details.get("space_complexity"), str) else None,
        code=details.get("code") if isinstance(details.get("code"), str) else None,
        reflection=feedback.headline,
        mistakes="\n".join(
            str(item.get("detail", ""))
            for item in feedback.feedback.get("issues_or_missing", [])
            if isinstance(item, dict) and item.get("detail")
        )
        or None,
        edge_cases=None,
        needs_review=bool(feedback.feedback.get("needs_review", True)) or result != "solved",
        ai_feedback_json=json.dumps({"source": "mobile_reasoning", "feedback_id": feedback.id}, ensure_ascii=False),
        ai_feedback_status="completed",
    )
    db.add(attempt)
    db.flush()
    item = db.get(AlgorithmPracticeSessionItem, answer.session_item_id) if answer.session_item_id else None
    if item:
        item.status = "solved" if result == "solved" and not attempt.needs_review else "needs_review"
        item.completed_at = item.completed_at or now
    _sync_progress_and_review(db, attempt)
    feedback.synced_attempt_id = attempt.id
    answer.checked_at = now


async def check_saved_reasoning_answer(
    db: Session,
    answer_id: int,
    *,
    refresh: bool = False,
) -> AlgorithmReasoningCheckResponse:
    answer = db.get(AlgorithmReasoningAnswer, answer_id)
    if answer is None:
        raise AlgorithmReasoningNotFound("回答不存在。")

    existing = _feedback_for_answer(db, answer.id)
    context = _current_context(db, answer.problem_id)
    if existing is not None and not refresh:
        return _envelope(db, answer, check_status="completed", context=context)
    if context is None:
        problem = db.get(AlgorithmProblem, answer.problem_id)
        return AlgorithmReasoningCheckResponse(
            save_status="saved",
            check_status="context_unavailable",
            answer=_answer_read(db, answer),
            feedback=None,
            check_error="该题核对内容尚未就绪。",
            problem_context=_problem_summary(problem, None) if problem else None,
        )

    try:
        result = await generate_algorithm_reasoning_feedback(
            context=context.context,
            answer=answer,
            previous_feedback=_previous_feedback(db, answer),
        )
    except Exception as exc:
        return _envelope(db, answer, check_status="failed", check_error=f"思路核对暂时不可用：{exc}", context=context)

    if existing is None:
        feedback = AlgorithmReasoningFeedback(
            answer_id=answer.id,
            problem_context_id=context.id,
            conclusion=result.conclusion,
            headline=result.headline,
            context_sufficient=result.context_sufficient,
            feedback_json=result.model_dump_json(),
            model_name=settings.llm_model,
            prompt_version=PROMPT_VERSION,
            context_version=context.content_version,
        )
        db.add(feedback)
        db.flush()
    else:
        feedback = existing
        feedback.problem_context_id = context.id
        feedback.conclusion = result.conclusion
        feedback.headline = result.headline
        feedback.context_sufficient = result.context_sufficient
        feedback.feedback_json = result.model_dump_json()
        feedback.model_name = settings.llm_model
        feedback.prompt_version = PROMPT_VERSION
        feedback.context_version = context.content_version
    _sync_feedback_progress(db, answer, feedback)
    db.commit()
    db.refresh(answer)
    return _envelope(db, answer, check_status="completed", context=context)


async def save_and_check_reasoning_answer(
    db: Session,
    payload: AlgorithmReasoningAnswerCreate,
) -> tuple[AlgorithmReasoningCheckResponse, bool]:
    answer, created = save_reasoning_answer(db, payload)
    response = await check_saved_reasoning_answer(db, answer.id, refresh=False)
    return response, created


def upsert_problem_context(db: Session, payload: AlgorithmProblemContextSeed) -> tuple[AlgorithmProblemContext, str]:
    if payload.content_status != "ready":
        raise CatalogBuildError([f"{payload.problem_key}: content_status 必须为 ready 才能导入"])
    problem = get_by_identifier(db, payload.problem_key)
    if problem is None:
        raise CatalogBuildError([f"{payload.problem_key}: 未在算法 catalog 中找到对应题目"])
    if problem.url != payload.source.url:
        raise CatalogBuildError([f"{payload.problem_key}: source.url 必须与 catalog URL 一致"])

    digest = _content_hash(payload)
    existing_hash = db.scalar(
        select(AlgorithmProblemContext).where(
            AlgorithmProblemContext.problem_id == problem.id,
            AlgorithmProblemContext.content_hash == digest,
        )
    )
    if existing_hash is not None:
        if not existing_hash.is_current:
            for old in db.scalars(select(AlgorithmProblemContext).where(AlgorithmProblemContext.problem_id == problem.id)).all():
                old.is_current = old.id == existing_hash.id
        return existing_hash, "skipped"

    current_max = db.scalar(
        select(func.max(AlgorithmProblemContext.content_version)).where(AlgorithmProblemContext.problem_id == problem.id)
    )
    version = int(current_max or 0) + 1
    for old in db.scalars(select(AlgorithmProblemContext).where(AlgorithmProblemContext.problem_id == problem.id)).all():
        old.is_current = False
    now = utc_now()
    record = AlgorithmProblemContext(
        problem_id=problem.id,
        problem_key=payload.problem_key,
        schema_version=payload.schema_version,
        content_version=version,
        content_hash=digest,
        context_json=payload.model_dump_json(exclude_none=True),
        content_status=payload.content_status,
        is_current=True,
        content_updated_at=now,
        imported_at=now,
    )
    db.add(record)
    return record, "created"


def import_mobile_problem_contexts(
    db: Session,
    contexts_dir: Path,
    dry_run: bool = False,
    *,
    defer_commit: bool = False,
) -> MobileContextImportResult:
    result = MobileContextImportResult(dry_run=dry_run)
    if not contexts_dir.exists():
        raise CatalogBuildError([f"移动算法题上下文目录不存在: {contexts_dir}"])
    files = sorted(contexts_dir.glob("*.json"))
    if not files:
        raise CatalogBuildError([f"移动算法题上下文目录为空: {contexts_dir}"])
    try:
        for path in files:
            try:
                payload = AlgorithmProblemContextSeed.model_validate(read_json(path))
                record, action = upsert_problem_context(db, payload)
                db.flush()
                result.record(action, payload.problem_key, record.content_version)
            except (ValidationError, CatalogBuildError) as exc:
                result.errors += 1
                result.changes.append({"file": str(path), "action": "error", "message": str(exc)})
        if result.errors:
            raise CatalogBuildError([str(change) for change in result.changes if change.get("action") == "error"])
        if defer_commit:
            pass
        elif dry_run:
            db.rollback()
        else:
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        result.errors += 1
        raise CatalogBuildError([f"移动算法题上下文导入失败，事务已回滚: {exc}"]) from exc
    return result
