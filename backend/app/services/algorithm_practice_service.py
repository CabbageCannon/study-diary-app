from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.llm import generate_algorithm_ai_review, generate_algorithm_hint
from app.models import (
    AlgorithmAttempt,
    AlgorithmPracticeSession,
    AlgorithmPracticeSessionItem,
    AlgorithmProblem,
    AlgorithmProblemProgress,
    AlgorithmReviewSchedule,
)
from app.repositories.algorithm_practice_repository import (
    get_attempt,
    get_problem,
    get_review_schedule,
    get_session,
    get_session_item,
    latest_attempts_by_problem,
    list_active_problems,
    list_attempts,
    list_session_items,
    list_sessions,
    progress_by_problem,
    review_schedules_by_problem,
)
from app.repositories.algorithm_repository import get_by_identifier
from app.schemas import (
    AlgorithmAIReview,
    AlgorithmAttemptCreate,
    AlgorithmAttemptRead,
    AlgorithmAttemptUpdate,
    AlgorithmHintRead,
    AlgorithmPracticeSessionCreate,
    AlgorithmPracticeSessionItemRead,
    AlgorithmPracticeSessionProgressUpdate,
    AlgorithmPracticeSessionRead,
    AlgorithmPracticeSessionSummary,
    AlgorithmProblemRead,
    AlgorithmReviewScheduleRead,
    AlgorithmStatsRead,
    AlgorithmWeaknessRead,
)


FINAL_ITEM_STATUSES = {"solved", "needs_review", "skipped"}
FAILED_RESULTS = {"failed", "gave_up"}


class AlgorithmPracticeError(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _problem_read(problem: AlgorithmProblem) -> AlgorithmProblemRead:
    return AlgorithmProblemRead.model_validate(problem)


def _attempt_read(attempt: AlgorithmAttempt | None) -> AlgorithmAttemptRead | None:
    return AlgorithmAttemptRead.model_validate(attempt) if attempt else None


def _stable_sort_key(seed: str, problem: AlgorithmProblem) -> str:
    return hashlib.sha256(f"{seed}:{problem.id}:{problem.stable_key}".encode("utf-8")).hexdigest()


def _matches_request(problem: AlgorithmProblem, request: AlgorithmPracticeSessionCreate) -> bool:
    if request.topics and not set(request.topics).intersection(problem.topics):
        return False
    if request.difficulty and problem.difficulty not in request.difficulty:
        return False
    if request.source_lists and not set(request.source_lists).intersection(problem.source_lists):
        return False
    return True


def _due_problem_ids(db: Session, now: datetime) -> set[int]:
    return {
        problem_id
        for problem_id in db.scalars(
            select(AlgorithmReviewSchedule.problem_id).where(AlgorithmReviewSchedule.next_review_at <= now)
        ).all()
    }


def _weak_topics(db: Session, problems: list[AlgorithmProblem]) -> set[str]:
    progress = progress_by_problem(db, [problem.id for problem in problems])
    scored: list[tuple[float, str]] = []
    by_topic: dict[str, list[AlgorithmProblemProgress]] = defaultdict(list)
    problem_by_id = {problem.id: problem for problem in problems}
    for record in progress.values():
        for topic in problem_by_id[record.problem_id].topics:
            by_topic[topic].append(record)
    for topic, records in by_topic.items():
        attempts = sum(record.attempt_count for record in records)
        if not attempts:
            continue
        solved = sum(record.solved_count for record in records)
        review_count = sum(1 for record in records if record.needs_review)
        score = solved / attempts - review_count * 0.35 - sum(record.mastery_level for record in records) / (len(records) * 12)
        scored.append((score, topic))
    return {topic for _, topic in sorted(scored)[:3]}


def _similar_candidates(reference: AlgorithmProblem, problems: list[AlgorithmProblem]) -> list[AlgorithmProblem]:
    reference_topics = set(reference.topics)
    reference_lists = set(reference.source_lists)
    candidates: list[tuple[float, AlgorithmProblem]] = []
    for problem in problems:
        if problem.id == reference.id:
            continue
        overlap = len(reference_topics.intersection(problem.topics))
        if not overlap:
            continue
        score = overlap * 10
        if problem.difficulty == reference.difficulty:
            score += 3
        if reference_lists.intersection(problem.source_lists):
            score += 1
        candidates.append((score, problem))
    return [problem for _, problem in sorted(candidates, key=lambda item: (-item[0], item[1].id))]


def _select_problems(db: Session, request: AlgorithmPracticeSessionCreate, session_seed: str) -> tuple[list[AlgorithmProblem], int]:
    now = utc_now()
    problems = list_active_problems(db)
    if not problems:
        raise AlgorithmPracticeError("算法题库为空。请先导入经过验证的本地题目元数据。")

    if request.mode == "hot100":
        request = request.model_copy(update={"source_lists": sorted(set(request.source_lists) | {"hot100"})})
    if request.mode == "daily":
        request = request.model_copy(update={"count": 1})
    if request.mode == "custom":
        if not request.problem_ids:
            raise AlgorithmPracticeError("自定义训练需要至少选择一道本地题库中的题目。")
        lookup = {problem.stable_key: problem for problem in problems} | {str(problem.id): problem for problem in problems}
        selected: list[AlgorithmProblem] = []
        for identifier in request.problem_ids:
            problem = lookup.get(identifier)
            if problem is None:
                raise AlgorithmPracticeError(f"题目 {identifier} 不存在于本地题库。")
            if problem not in selected:
                selected.append(problem)
        return selected[: request.count], len(selected)

    candidates = [problem for problem in problems if _matches_request(problem, request)]
    progress = progress_by_problem(db, [problem.id for problem in candidates])
    latest_attempts = latest_attempts_by_problem(db, [problem.id for problem in candidates])
    due_ids = _due_problem_ids(db, now)

    if request.mode == "review":
        candidates = [problem for problem in candidates if problem.id in due_ids]
    elif request.mode == "wrong":
        candidates = [
            problem
            for problem in candidates
            if progress.get(problem.id, None) and progress[problem.id].needs_review
            or latest_attempts.get(problem.id, None) and latest_attempts[problem.id].result in FAILED_RESULTS
        ]
    elif request.mode == "weakness":
        weak_topics = _weak_topics(db, candidates)
        candidates = [problem for problem in candidates if weak_topics.intersection(problem.topics)]
    elif request.mode == "similar":
        if not request.reference_problem_id:
            raise AlgorithmPracticeError("相似题训练需要选择一题作为参考。")
        reference = get_by_identifier(db, request.reference_problem_id)
        if reference is None:
            raise AlgorithmPracticeError("参考题目不存在于本地题库。")
        candidates = [problem for problem in _similar_candidates(reference, candidates) if _matches_request(problem, request)]

    if request.exclude_solved:
        candidates = [problem for problem in candidates if progress.get(problem.id) is None or progress[problem.id].status != "solved"]

    if not candidates:
        raise AlgorithmPracticeError("没有符合当前条件的本地题目。请放宽筛选条件或先导入题库。")

    if request.mode == "daily":
        unsolved = [problem for problem in candidates if progress.get(problem.id) is None or progress[problem.id].status != "solved"]
        pool = [problem for problem in candidates if problem.id in due_ids] or unsolved or candidates
        day_seed = now.date().isoformat()
        return [sorted(pool, key=lambda problem: _stable_sort_key(day_seed, problem))[0]], len(pool)

    ordered = sorted(candidates, key=lambda problem: _stable_sort_key(session_seed, problem))
    if request.prioritize_due_review:
        ordered = sorted(ordered, key=lambda problem: (problem.id not in due_ids, _stable_sort_key(session_seed, problem)))
    return ordered[: request.count], len(candidates)


def _session_items_read(db: Session, session: AlgorithmPracticeSession) -> list[AlgorithmPracticeSessionItemRead]:
    items = list_session_items(db, session.id)
    problems = {problem.id: problem for problem in list_active_problems(db)}
    attempts = list_attempts(db, session_id=session.id, limit=500)
    attempts_by_problem: dict[int, list[AlgorithmAttempt]] = defaultdict(list)
    for attempt in attempts:
        attempts_by_problem[attempt.problem_id].append(attempt)
    result: list[AlgorithmPracticeSessionItemRead] = []
    for item in items:
        problem = problems.get(item.problem_id)
        if problem is None:
            continue
        problem_attempts = attempts_by_problem.get(item.problem_id, [])
        result.append(
            AlgorithmPracticeSessionItemRead(
                id=item.id,
                problem_id=item.problem_id,
                position=item.position,
                status=item.status,
                started_at=item.started_at,
                completed_at=item.completed_at,
                skipped_at=item.skipped_at,
                problem=_problem_read(problem),
                latest_attempt=_attempt_read(problem_attempts[0] if problem_attempts else None),
                attempt_count=len(problem_attempts),
            )
        )
    return result


def session_read(db: Session, session: AlgorithmPracticeSession, *, available_problem_count: int = 0) -> AlgorithmPracticeSessionRead:
    items = _session_items_read(db, session)
    message = None
    if available_problem_count and len(items) < session.requested_count:
        message = f"当前筛选仅找到 {len(items)} 道可用题目，已按固定顺序创建训练。"
    return AlgorithmPracticeSessionRead(
        id=session.id,
        mode=session.mode,
        status=session.status,
        requested_count=session.requested_count,
        question_count=len(items),
        current_index=min(session.current_index, max(0, len(items) - 1)),
        filters=session.filters,
        started_at=session.started_at,
        last_active_at=session.last_active_at,
        completed_at=session.completed_at,
        abandoned_at=session.abandoned_at,
        created_at=session.created_at,
        updated_at=session.updated_at,
        items=items,
        available_problem_count=available_problem_count or len(items),
        availability_message=message,
    )


def create_session(db: Session, request: AlgorithmPracticeSessionCreate) -> AlgorithmPracticeSessionRead:
    session_id = str(uuid4())
    selected, available_count = _select_problems(db, request, session_id)
    now = utc_now()
    session = AlgorithmPracticeSession(
        id=session_id,
        mode=request.mode,
        status="in_progress",
        requested_count=request.count,
        current_index=0,
        filters_json=json.dumps(request.model_dump(mode="json"), ensure_ascii=False),
        started_at=now,
        last_active_at=now,
    )
    db.add(session)
    for position, problem in enumerate(selected):
        db.add(
            AlgorithmPracticeSessionItem(
                session_id=session.id,
                problem_id=problem.id,
                position=position,
                status="in_progress" if position == 0 else "pending",
                started_at=now if position == 0 else None,
            )
        )
    db.commit()
    db.refresh(session)
    return session_read(db, session, available_problem_count=available_count)


def daily_problem(db: Session) -> AlgorithmProblemRead:
    selected, _ = _select_problems(
        db,
        AlgorithmPracticeSessionCreate(mode="daily", count=1, prioritize_due_review=True),
        f"daily:{utc_now().date().isoformat()}",
    )
    return _problem_read(selected[0])


def get_session_read(db: Session, session_id: str) -> AlgorithmPracticeSessionRead:
    session = get_session(db, session_id)
    if session is None:
        raise AlgorithmPracticeError("训练会话不存在或已删除。")
    return session_read(db, session)


def list_session_summaries(db: Session, *, status: str | None, limit: int) -> list[AlgorithmPracticeSessionSummary]:
    summaries: list[AlgorithmPracticeSessionSummary] = []
    for session in list_sessions(db, status=status, limit=limit):
        items = list_session_items(db, session.id)
        summaries.append(
            AlgorithmPracticeSessionSummary(
                id=session.id,
                mode=session.mode,
                status=session.status,
                question_count=len(items),
                solved_count=sum(item.status == "solved" for item in items),
                needs_review_count=sum(item.status == "needs_review" for item in items),
                current_index=session.current_index,
                started_at=session.started_at,
                last_active_at=session.last_active_at,
                completed_at=session.completed_at,
            )
        )
    return summaries


def update_session_progress(
    db: Session, session_id: str, payload: AlgorithmPracticeSessionProgressUpdate
) -> AlgorithmPracticeSessionRead:
    session = get_session(db, session_id)
    if session is None:
        raise AlgorithmPracticeError("训练会话不存在或已删除。")
    if session.status != "in_progress":
        raise AlgorithmPracticeError("已结束的训练会话不能继续更新进度。")
    items = list_session_items(db, session.id)
    if payload.current_index >= len(items):
        raise AlgorithmPracticeError("当前题目位置超出会话范围。")
    item = items[payload.current_index]
    now = utc_now()
    session.current_index = payload.current_index
    session.last_active_at = now
    if payload.item_status:
        item.status = payload.item_status
        if payload.item_status == "in_progress" and item.started_at is None:
            item.started_at = now
        if payload.item_status in {"solved", "needs_review"}:
            item.completed_at = now
        if payload.item_status == "skipped":
            item.skipped_at = now
    db.commit()
    db.refresh(session)
    return session_read(db, session)


def skip_session_problem(db: Session, session_id: str) -> AlgorithmPracticeSessionRead:
    session = get_session(db, session_id)
    if session is None or session.status != "in_progress":
        raise AlgorithmPracticeError("只能跳过进行中的训练题目。")
    items = list_session_items(db, session.id)
    if not items:
        raise AlgorithmPracticeError("训练会话没有题目。")
    item = items[min(session.current_index, len(items) - 1)]
    now = utc_now()
    item.status = "skipped"
    item.skipped_at = now
    pending_indexes = [candidate.position for candidate in items if candidate.status == "pending"]
    session.current_index = pending_indexes[0] if pending_indexes else min(session.current_index, len(items) - 1)
    session.last_active_at = now
    if pending_indexes:
        next_item = next(candidate for candidate in items if candidate.position == session.current_index)
        next_item.status = "in_progress"
        next_item.started_at = next_item.started_at or now
    db.commit()
    db.refresh(session)
    return session_read(db, session)


def finish_session(db: Session, session_id: str, *, abandoned: bool = False) -> AlgorithmPracticeSessionRead:
    session = get_session(db, session_id)
    if session is None:
        raise AlgorithmPracticeError("训练会话不存在或已删除。")
    if session.status != "in_progress":
        raise AlgorithmPracticeError("该训练会话已经结束。")
    now = utc_now()
    session.status = "abandoned" if abandoned else "completed"
    session.last_active_at = now
    if abandoned:
        session.abandoned_at = now
    else:
        session.completed_at = now
    db.commit()
    db.refresh(session)
    return session_read(db, session)


def delete_session(db: Session, session_id: str) -> None:
    session = get_session(db, session_id)
    if session is None:
        raise AlgorithmPracticeError("训练会话不存在或已删除。")
    session.deleted_at = utc_now()
    db.commit()


def _review_interval(result: str, needs_review: bool, previous_count: int, mastery_level: int) -> int:
    if result in FAILED_RESULTS:
        return 1 if previous_count <= 1 else 3
    if result == "partially_solved" or needs_review:
        return 3
    return [7, 14, 30, 60][min(max(mastery_level, 0), 3)]


def _sync_progress_and_review(db: Session, attempt: AlgorithmAttempt) -> None:
    progress = db.scalar(select(AlgorithmProblemProgress).where(AlgorithmProblemProgress.problem_id == attempt.problem_id))
    if progress is None:
        progress = AlgorithmProblemProgress(problem_id=attempt.problem_id)
        db.add(progress)
        db.flush()
    requires_review = attempt.needs_review or attempt.result in FAILED_RESULTS or attempt.result == "partially_solved"
    progress.attempt_count += 1
    progress.solved_count += int(attempt.result == "solved")
    progress.last_attempt_at = attempt.submitted_at or utc_now()
    progress.last_result = attempt.result
    progress.needs_review = requires_review
    if attempt.duration_seconds is not None and attempt.result == "solved":
        progress.best_duration_seconds = min(progress.best_duration_seconds, attempt.duration_seconds) if progress.best_duration_seconds else attempt.duration_seconds
    if requires_review:
        progress.status = "needs_review"
        progress.mastery_level = max(0, progress.mastery_level - 1)
    elif attempt.result == "solved":
        progress.status = "solved"
        progress.mastery_level = min(5, progress.mastery_level + 1)
    else:
        progress.status = "attempted"

    schedule = get_review_schedule(db, attempt.problem_id)
    previous_count = schedule.review_count if schedule else 0
    interval = _review_interval(attempt.result, requires_review, previous_count, progress.mastery_level)
    reason = "wrong" if attempt.result in FAILED_RESULTS else "needs_review" if requires_review else "spaced_repetition"
    if schedule is None:
        schedule = AlgorithmReviewSchedule(
            problem_id=attempt.problem_id,
            last_attempt_id=attempt.id,
            next_review_at=(attempt.submitted_at or utc_now()) + timedelta(days=interval),
            interval_days=interval,
            review_count=1,
            mastery_level=progress.mastery_level,
            reason=reason,
        )
        db.add(schedule)
    else:
        schedule.last_attempt_id = attempt.id
        schedule.interval_days = interval
        schedule.next_review_at = (attempt.submitted_at or utc_now()) + timedelta(days=interval)
        schedule.review_count += 1
        schedule.mastery_level = progress.mastery_level
        schedule.reason = reason


def create_attempt(db: Session, payload: AlgorithmAttemptCreate) -> AlgorithmAttemptRead:
    problem = get_problem(db, payload.problem_id)
    if problem is None or not problem.is_active:
        raise AlgorithmPracticeError("题目不存在于可用的本地题库。")
    session_item: AlgorithmPracticeSessionItem | None = None
    if payload.session_id:
        session = get_session(db, payload.session_id)
        if session is None:
            raise AlgorithmPracticeError("训练会话不存在或已删除。")
        session_item = get_session_item(db, session.id, problem.id)
        if session_item is None:
            raise AlgorithmPracticeError("该题目不属于当前训练会话。")
    now = utc_now()
    attempt = AlgorithmAttempt(
        problem_id=problem.id,
        session_id=payload.session_id,
        session_item_id=session_item.id if session_item else None,
        started_at=now - timedelta(seconds=payload.duration_seconds or 0),
        submitted_at=now,
        duration_seconds=payload.duration_seconds,
        result=payload.result,
        language=payload.language,
        approach=payload.approach or "",
        time_complexity=payload.time_complexity,
        space_complexity=payload.space_complexity,
        code=payload.code,
        reflection=payload.reflection,
        mistakes=payload.mistakes,
        edge_cases=payload.edge_cases,
        needs_review=payload.needs_review,
    )
    db.add(attempt)
    db.flush()
    if session_item:
        session_item.status = "solved" if payload.result == "solved" and not payload.needs_review else "needs_review"
        session_item.completed_at = now
        session = get_session(db, payload.session_id)
        if session:
            session.last_active_at = now
    _sync_progress_and_review(db, attempt)
    db.commit()
    db.refresh(attempt)
    return _attempt_read(attempt)  # type: ignore[return-value]


def update_attempt(db: Session, attempt_id: int, payload: AlgorithmAttemptUpdate) -> AlgorithmAttemptRead:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        raise AlgorithmPracticeError("解题记录不存在。")
    for name, value in payload.model_dump(exclude_unset=True).items():
        setattr(attempt, name, value)
    db.commit()
    db.refresh(attempt)
    return _attempt_read(attempt)  # type: ignore[return-value]


def delete_attempt(db: Session, attempt_id: int) -> None:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        raise AlgorithmPracticeError("解题记录不存在。")

    remaining_attempts = list(
        db.scalars(
            select(AlgorithmAttempt)
            .where(AlgorithmAttempt.problem_id == attempt.problem_id, AlgorithmAttempt.id != attempt.id)
            .order_by(AlgorithmAttempt.submitted_at.desc(), AlgorithmAttempt.id.desc())
        ).all()
    )
    schedule = get_review_schedule(db, attempt.problem_id)
    if schedule and schedule.last_attempt_id == attempt.id:
        if remaining_attempts:
            latest = remaining_attempts[0]
            requires_review = latest.needs_review or latest.result in FAILED_RESULTS or latest.result == "partially_solved"
            mastery_level = max(0, min(5, sum(1 if item.result == "solved" else -1 if item.needs_review or item.result in FAILED_RESULTS or item.result == "partially_solved" else 0 for item in remaining_attempts)))
            schedule.last_attempt_id = latest.id
            schedule.interval_days = _review_interval(latest.result, requires_review, max(0, len(remaining_attempts) - 1), mastery_level)
            schedule.next_review_at = (latest.submitted_at or latest.created_at) + timedelta(days=schedule.interval_days)
            schedule.review_count = len(remaining_attempts)
            schedule.mastery_level = mastery_level
            schedule.reason = "wrong" if latest.result in FAILED_RESULTS else "needs_review" if requires_review else "spaced_repetition"
        else:
            db.delete(schedule)

    progress = db.scalar(select(AlgorithmProblemProgress).where(AlgorithmProblemProgress.problem_id == attempt.problem_id))
    if progress:
        if not remaining_attempts:
            db.delete(progress)
        else:
            latest = remaining_attempts[0]
            progress.attempt_count = len(remaining_attempts)
            progress.solved_count = sum(item.result == "solved" for item in remaining_attempts)
            progress.last_attempt_at = latest.submitted_at or latest.created_at
            progress.last_result = latest.result
            progress.needs_review = latest.needs_review or latest.result in FAILED_RESULTS or latest.result == "partially_solved"
            progress.best_duration_seconds = min((item.duration_seconds for item in remaining_attempts if item.result == "solved" and item.duration_seconds is not None), default=None)
            progress.mastery_level = max(0, min(5, sum(1 if item.result == "solved" else -1 if item.needs_review or item.result in FAILED_RESULTS or item.result == "partially_solved" else 0 for item in reversed(remaining_attempts))))
            progress.status = "needs_review" if progress.needs_review else "solved" if latest.result == "solved" else "attempted"
    db.delete(attempt)
    db.commit()


def get_attempt_read(db: Session, attempt_id: int) -> AlgorithmAttemptRead:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        raise AlgorithmPracticeError("解题记录不存在。")
    return _attempt_read(attempt)  # type: ignore[return-value]


async def request_hint(db: Session, attempt_id: int, hint_level: int, approach: str) -> AlgorithmHintRead:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        raise AlgorithmPracticeError("解题记录不存在。")
    problem = get_problem(db, attempt.problem_id)
    if problem is None:
        raise AlgorithmPracticeError("题目不存在于本地题库。")
    content = await generate_algorithm_hint(problem=problem, approach=approach or attempt.approach, hint_level=hint_level)
    attempt.hint_count = max(attempt.hint_count, hint_level)
    if attempt.hint_count >= 2:
        attempt.needs_review = True
    db.commit()
    return AlgorithmHintRead(hint_level=hint_level, content=content, remaining_hint_levels=max(0, 4 - hint_level))


async def request_ai_review(db: Session, attempt_id: int) -> AlgorithmAttemptRead:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        raise AlgorithmPracticeError("解题记录不存在。")
    problem = get_problem(db, attempt.problem_id)
    if problem is None:
        raise AlgorithmPracticeError("题目不存在于本地题库。")
    candidates = _similar_candidates(problem, list_active_problems(db))[:5]
    attempt.ai_feedback_status = "processing"
    db.commit()
    review = await generate_algorithm_ai_review(problem=problem, attempt=attempt, candidate_problem_ids=[item.id for item in candidates])
    valid_ids = {item.id for item in candidates}
    review = review.model_copy(update={"recommended_problem_ids": [item for item in review.recommended_problem_ids if item in valid_ids]})
    attempt.ai_feedback_json = review.model_dump_json()
    attempt.ai_feedback_status = "completed"
    if review.needs_review:
        attempt.needs_review = True
        progress = db.scalar(select(AlgorithmProblemProgress).where(AlgorithmProblemProgress.problem_id == attempt.problem_id))
        if progress is None:
            progress = AlgorithmProblemProgress(problem_id=attempt.problem_id)
            db.add(progress)
        progress.needs_review = True
        progress.status = "needs_review"
        schedule = get_review_schedule(db, attempt.problem_id)
        if schedule is None:
            db.add(
                AlgorithmReviewSchedule(
                    problem_id=attempt.problem_id,
                    last_attempt_id=attempt.id,
                    next_review_at=utc_now() + timedelta(days=3),
                    interval_days=3,
                    review_count=1,
                    mastery_level=progress.mastery_level,
                    reason="ai_feedback",
                )
            )
        else:
            schedule.last_attempt_id = attempt.id
            schedule.next_review_at = utc_now() + timedelta(days=min(schedule.interval_days, 3))
            schedule.interval_days = min(schedule.interval_days, 3)
            schedule.reason = "ai_feedback"
    db.commit()
    db.refresh(attempt)
    return _attempt_read(attempt)  # type: ignore[return-value]


def mark_ai_review_failed(db: Session, attempt_id: int) -> None:
    attempt = get_attempt(db, attempt_id)
    if attempt is None:
        return
    attempt.ai_feedback_status = "failed"
    db.commit()


def due_reviews(db: Session, *, limit: int) -> list[AlgorithmReviewScheduleRead]:
    now = utc_now()
    schedules = list(
        db.scalars(
            select(AlgorithmReviewSchedule)
            .where(AlgorithmReviewSchedule.next_review_at <= now)
            .order_by(AlgorithmReviewSchedule.next_review_at)
            .limit(limit)
        ).all()
    )
    return [
        AlgorithmReviewScheduleRead(
            problem=_problem_read(problem),
            next_review_at=schedule.next_review_at,
            interval_days=schedule.interval_days,
            review_count=schedule.review_count,
            mastery_level=schedule.mastery_level,
            reason=schedule.reason,
            last_attempt=_attempt_read(get_attempt(db, schedule.last_attempt_id)),
        )
        for schedule in schedules
        if (problem := get_problem(db, schedule.problem_id)) is not None
    ]


def create_review_session(db: Session, *, count: int) -> AlgorithmPracticeSessionRead:
    return create_session(db, AlgorithmPracticeSessionCreate(mode="review", count=count, prioritize_due_review=True))


def similar_problems(db: Session, problem_id: str, *, limit: int) -> list[AlgorithmProblemRead]:
    reference = get_by_identifier(db, problem_id)
    if reference is None:
        raise AlgorithmPracticeError("题目不存在于本地题库。")
    return [_problem_read(problem) for problem in _similar_candidates(reference, list_active_problems(db))[:limit]]


def _date_key(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).date().isoformat()


def algorithm_stats(db: Session) -> AlgorithmStatsRead:
    now = utc_now()
    attempts = list(db.scalars(select(AlgorithmAttempt).where(AlgorithmAttempt.submitted_at.is_not(None))).all())
    problems = {problem.id: problem for problem in list_active_problems(db)}
    progress = list(db.scalars(select(AlgorithmProblemProgress)).all())
    sessions = list(
        db.scalars(
            select(AlgorithmPracticeSession).where(
                AlgorithmPracticeSession.status == "in_progress", AlgorithmPracticeSession.deleted_at.is_(None)
            )
        ).all()
    )
    completed_by_difficulty = {difficulty: 0 for difficulty in ("easy", "medium", "hard")}
    completed_by_topic: dict[str, int] = defaultdict(int)
    topic_attempts: dict[str, int] = defaultdict(int)
    topic_successes: dict[str, int] = defaultdict(int)
    topic_duration_totals: dict[str, list[int]] = defaultdict(list)
    day_counts: dict[str, int] = defaultdict(int)
    durations: list[int] = []
    for attempt in attempts:
        problem = problems.get(attempt.problem_id)
        if problem is None:
            continue
        date_key = _date_key(attempt.submitted_at)
        if date_key:
            day_counts[date_key] += 1
        if attempt.duration_seconds is not None:
            durations.append(attempt.duration_seconds)
        for topic in problem.topics:
            topic_attempts[topic] += 1
            if attempt.result == "solved":
                topic_successes[topic] += 1
            if attempt.duration_seconds is not None:
                topic_duration_totals[topic].append(attempt.duration_seconds)
    for record in progress:
        problem = problems.get(record.problem_id)
        if problem is None or record.solved_count <= 0:
            continue
        completed_by_difficulty[problem.difficulty] = completed_by_difficulty.get(problem.difficulty, 0) + 1
        for topic in problem.topics:
            completed_by_topic[topic] += 1
    today = now.date()
    streak = 0
    while (today - timedelta(days=streak)).isoformat() in day_counts:
        streak += 1

    def trend(days: int) -> list[dict[str, int | str]]:
        return [
            {"date": (today - timedelta(days=offset)).isoformat(), "attempt_count": day_counts.get((today - timedelta(days=offset)).isoformat(), 0)}
            for offset in range(days - 1, -1, -1)
        ]

    return AlgorithmStatsRead(
        current_streak_days=streak,
        today_completed_count=sum(
            attempt.result == "solved" and _date_key(attempt.submitted_at) == today.isoformat() for attempt in attempts
        ),
        total_attempt_count=len(attempts),
        unique_solved_count=sum(record.solved_count > 0 for record in progress),
        completed_by_difficulty=completed_by_difficulty,
        completed_by_topic=dict(completed_by_topic),
        success_rate_by_topic={
            topic: round(topic_successes[topic] / count, 3) for topic, count in topic_attempts.items() if count
        },
        average_duration_seconds=round(sum(durations) / len(durations)) if durations else None,
        due_review_count=len(_due_problem_ids(db, now)),
        wrong_problem_count=sum(record.needs_review for record in progress),
        in_progress_session_count=len(sessions),
        recent_7_days=trend(7),
        recent_30_days=trend(30),
    )


def algorithm_weaknesses(db: Session) -> list[AlgorithmWeaknessRead]:
    stats = algorithm_stats(db)
    problems = {problem.id: problem for problem in list_active_problems(db)}
    progress = list(db.scalars(select(AlgorithmProblemProgress)).all())
    schedules = review_schedules_by_problem(db, problems)
    by_topic: dict[str, list[AlgorithmProblemProgress]] = defaultdict(list)
    for record in progress:
        problem = problems.get(record.problem_id)
        if problem:
            for topic in problem.topics:
                by_topic[topic].append(record)
    results: list[AlgorithmWeaknessRead] = []
    now = utc_now()
    for topic, records in by_topic.items():
        attempts = sum(record.attempt_count for record in records)
        successes = sum(record.solved_count for record in records)
        durations = [record.best_duration_seconds for record in records if record.best_duration_seconds is not None]
        review_records = [record for record in records if record.needs_review]
        due_count = sum(
            schedule.problem_id in {record.problem_id for record in records} and schedule.next_review_at <= now
            for schedule in schedules.values()
        )
        success_rate = successes / attempts if attempts else 0.0
        mastery = round(sum(record.mastery_level for record in records) / len(records) * 20) if records else 0
        results.append(
            AlgorithmWeaknessRead(
                topic=topic,
                attempt_count=attempts,
                success_rate=round(success_rate, 3),
                average_duration_seconds=round(sum(durations) / len(durations)) if durations else None,
                needs_review_count=len(review_records),
                due_review_count=due_count,
                mastery_score=mastery,
            )
        )
    return sorted(results, key=lambda item: (item.success_rate, -item.needs_review_count, -item.attempt_count))
