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
    AlgorithmDailyFeed,
    AlgorithmDailyRecommendationSettings,
    AlgorithmPracticeSession,
    AlgorithmPracticeSessionItem,
    AlgorithmProblem,
    AlgorithmProblemProgress,
    AlgorithmReviewSchedule,
)
from app.repositories.algorithm_practice_repository import (
    get_attempt,
    get_daily_feed as get_daily_feed_record,
    get_daily_recommendation_settings,
    get_problem,
    get_review_schedule,
    get_session,
    get_session_item,
    latest_attempts_by_problem,
    list_active_problems,
    list_all_problems,
    list_attempts,
    list_session_items,
    list_sessions,
    list_daily_feeds_since,
    progress_by_problem,
    review_schedules_by_problem,
)
from app.repositories.algorithm_repository import get_by_identifier
from app.schemas import (
    AlgorithmAIReview,
    AlgorithmAttemptCreate,
    AlgorithmAttemptRead,
    AlgorithmCatalogOverviewRead,
    AlgorithmDailyFeedRead,
    AlgorithmDailyRecommendationSettingsRead,
    AlgorithmDailyRecommendationSettingsUpdate,
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
        if request.problem_ids:
            lookup = {problem.stable_key: problem for problem in problems} | {str(problem.id): problem for problem in problems}
            selected = lookup.get(request.problem_ids[0])
            if selected is None:
                raise AlgorithmPracticeError("今日主推荐题目不存在于本地题库。")
            return [selected], 1
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


DAILY_STRATEGY_LABELS = {
    "balanced": "均衡推荐",
    "random": "稳定随机",
    "topic": "按题型推荐",
    "difficulty": "按难度推荐",
    "source_list": "按题单推荐",
    "weakness": "薄弱点优先",
    "wrong": "错题优先",
    "review_first": "复习优先",
}


def _settings_snapshot(settings: AlgorithmDailyRecommendationSettings) -> dict[str, object]:
    return {
        "strategy": settings.strategy,
        "topics": settings.topics,
        "difficulties": settings.difficulties,
        "source_lists": settings.source_lists,
        "exclude_solved": settings.exclude_solved,
        "prioritize_due_review": settings.prioritize_due_review,
        "avoid_recent_days": settings.avoid_recent_days,
        "extra_recommendation_count": settings.extra_recommendation_count,
        "include_adjacent_difficulty": settings.include_adjacent_difficulty,
        "include_review_items": settings.include_review_items,
    }


def _settings_summary(snapshot: dict[str, object]) -> str:
    strategy = DAILY_STRATEGY_LABELS.get(str(snapshot.get("strategy")), "均衡推荐")
    filters: list[str] = []
    topics = [str(item) for item in snapshot.get("topics", []) if str(item)]
    difficulties = [str(item) for item in snapshot.get("difficulties", []) if str(item)]
    source_lists = [str(item) for item in snapshot.get("source_lists", []) if str(item)]
    if topics:
        filters.append("、".join(topics[:2]))
    if difficulties:
        filters.append("、".join({"easy": "简单", "medium": "中等", "hard": "困难"}.get(item, item) for item in difficulties))
    if source_lists:
        filters.append("、".join(source_lists[:2]))
    detail = " · ".join(filters)
    review = "优先到期复习" if snapshot.get("prioritize_due_review") else "优先未完成"
    avoid_days = int(snapshot.get("avoid_recent_days") or 0)
    avoid = f"，避开最近 {avoid_days} 天重复" if avoid_days else ""
    return f"{strategy}{' · ' + detail if detail else ''}；{review}{avoid}。"


def _daily_settings_read(settings: AlgorithmDailyRecommendationSettings) -> AlgorithmDailyRecommendationSettingsRead:
    return AlgorithmDailyRecommendationSettingsRead(
        id=settings.id,
        **_settings_snapshot(settings),
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


def get_daily_settings(db: Session) -> AlgorithmDailyRecommendationSettingsRead:
    settings = get_daily_recommendation_settings(db)
    if settings is None:
        settings = AlgorithmDailyRecommendationSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return _daily_settings_read(settings)


def update_daily_settings(
    db: Session, payload: AlgorithmDailyRecommendationSettingsUpdate
) -> AlgorithmDailyRecommendationSettingsRead:
    settings = get_daily_recommendation_settings(db)
    if settings is None:
        settings = AlgorithmDailyRecommendationSettings(id=1)
        db.add(settings)
    settings.strategy = payload.strategy
    settings.topics_json = json.dumps(payload.topics, ensure_ascii=False)
    settings.difficulties_json = json.dumps(payload.difficulties, ensure_ascii=False)
    settings.source_lists_json = json.dumps(payload.source_lists, ensure_ascii=False)
    settings.exclude_solved = payload.exclude_solved
    settings.prioritize_due_review = payload.prioritize_due_review
    settings.avoid_recent_days = payload.avoid_recent_days
    settings.extra_recommendation_count = payload.extra_recommendation_count
    settings.include_adjacent_difficulty = payload.include_adjacent_difficulty
    settings.include_review_items = payload.include_review_items
    db.commit()
    db.refresh(settings)
    return _daily_settings_read(settings)


def _matches_daily_settings(
    problem: AlgorithmProblem,
    settings: AlgorithmDailyRecommendationSettings,
    *,
    match_difficulty: bool = True,
) -> bool:
    if settings.topics and not set(settings.topics).intersection(problem.topics):
        return False
    if match_difficulty and settings.difficulties and problem.difficulty not in settings.difficulties:
        return False
    if settings.source_lists and not set(settings.source_lists).intersection(problem.source_lists):
        return False
    return True


def _recent_daily_assignment_ids(db: Session, recommendation_date: str, avoid_days: int) -> set[int]:
    if avoid_days <= 0:
        return set()
    start_date = (datetime.fromisoformat(recommendation_date) - timedelta(days=avoid_days)).date().isoformat()
    ids: set[int] = set()
    for feed in list_daily_feeds_since(db, start_date, before_date=recommendation_date):
        ids.add(feed.primary_problem_id)
        ids.update(feed.extra_problem_ids)
    return ids


def _daily_candidates(
    db: Session,
    settings: AlgorithmDailyRecommendationSettings,
    recommendation_date: str,
    refresh_version: int,
) -> tuple[list[AlgorithmProblem], str | None]:
    active_problems = list_active_problems(db)
    if not active_problems:
        raise AlgorithmPracticeError("算法题库为空。请先导入经过验证的本地题目元数据。")

    warnings: list[str] = []
    candidates = [problem for problem in active_problems if _matches_daily_settings(problem, settings)]
    if settings.include_adjacent_difficulty and settings.difficulties:
        difficulty_order = ("easy", "medium", "hard")
        selected_indexes = {
            difficulty_order.index(difficulty)
            for difficulty in settings.difficulties
            if difficulty in difficulty_order
        }
        adjacent_difficulties = {
            difficulty_order[index + offset]
            for index in selected_indexes
            for offset in (-1, 1)
            if 0 <= index + offset < len(difficulty_order)
        }
        adjacent_candidates = [
            problem
            for problem in active_problems
            if problem.difficulty in adjacent_difficulties
            and _matches_daily_settings(problem, settings, match_difficulty=False)
            and problem.id not in {candidate.id for candidate in candidates}
        ]
        if adjacent_candidates and len(candidates) < 1 + settings.extra_recommendation_count:
            candidates.extend(adjacent_candidates)
            warnings.append("已在所选难度的题池不足时，补入相邻难度题目。")
    if not candidates:
        candidates = active_problems
        warnings.append("当前筛选没有可用题目，已临时放宽为全部本地题目。")

    progress = progress_by_problem(db, [problem.id for problem in candidates])
    latest_attempts = latest_attempts_by_problem(db, [problem.id for problem in candidates])
    due_ids = _due_problem_ids(db, utc_now()) if settings.include_review_items else set()

    if settings.strategy == "weakness":
        weak_topics = _weak_topics(db, candidates)
        narrowed = [problem for problem in candidates if weak_topics.intersection(problem.topics)]
        if narrowed:
            candidates = narrowed
        else:
            warnings.append("暂未形成明确薄弱点，已按当前筛选使用均衡推荐。")
    elif settings.strategy == "wrong":
        narrowed = [
            problem for problem in candidates
            if progress.get(problem.id) and progress[problem.id].needs_review
            or latest_attempts.get(problem.id) and latest_attempts[problem.id].result in FAILED_RESULTS
        ]
        if narrowed:
            candidates = narrowed
        else:
            warnings.append("暂时没有错题记录，已按当前筛选补充推荐。")

    if settings.exclude_solved:
        unsolved = [problem for problem in candidates if progress.get(problem.id) is None or progress[problem.id].status != "solved"]
        if unsolved:
            candidates = unsolved
        else:
            warnings.append("排除已完成后题池为空，已临时允许已完成题目。")

    recent_ids = _recent_daily_assignment_ids(db, recommendation_date, settings.avoid_recent_days)
    without_recent = [problem for problem in candidates if problem.id not in recent_ids or problem.id in due_ids]
    desired_count = 1 + settings.extra_recommendation_count
    if without_recent:
        candidates = without_recent
    if len(candidates) < desired_count and recent_ids:
        current_ids = {problem.id for problem in candidates}
        candidates = list({problem.id: problem for problem in candidates + [item for item in active_problems if item.id not in current_ids]}.values())
        warnings.append("当前题池不足，额外列表已放宽最近推荐限制。")

    candidate_progress = progress_by_problem(db, [problem.id for problem in candidates])
    strategy_seed = f"daily-feed:{recommendation_date}:{settings.strategy}:{refresh_version}"

    def priority(problem: AlgorithmProblem) -> tuple[int, int, str]:
        record = candidate_progress.get(problem.id)
        due_rank = 0 if problem.id in due_ids and (settings.prioritize_due_review or settings.strategy == "review_first") else 1
        if settings.strategy == "review_first":
            focus_rank = 0 if problem.id in due_ids else 1
        elif settings.strategy == "wrong":
            focus_rank = 0 if record and record.needs_review else 1
        elif settings.strategy == "balanced":
            focus_rank = 0 if record is None or record.status != "solved" else 1
        else:
            focus_rank = 0
        return due_rank, focus_rank, _stable_sort_key(strategy_seed, problem)

    ordered = sorted(candidates, key=priority)
    if len(ordered) < desired_count:
        warnings.append(f"当前条件只找到 {len(ordered)} 道可用题，继续刷列表将显示较少题目。")
    return ordered[:desired_count], " ".join(dict.fromkeys(warnings)) or None


def _daily_feed_read(db: Session, feed: AlgorithmDailyFeed) -> AlgorithmDailyFeedRead:
    problems = {problem.id: problem for problem in list_active_problems(db)}
    primary = problems.get(feed.primary_problem_id)
    if primary is None:
        raise AlgorithmPracticeError("今日主推荐题目已失效，正在重新生成推荐。")
    extras = [problems[problem_id] for problem_id in feed.extra_problem_ids if problem_id in problems and problem_id != primary.id]
    snapshot = feed.settings_snapshot
    progress = progress_by_problem(db, [primary.id]).get(primary.id)
    return AlgorithmDailyFeedRead(
        date=feed.recommendation_date,
        primary_problem=_problem_read(primary),
        extra_problems=[_problem_read(problem) for problem in extras],
        strategy=str(snapshot.get("strategy", "balanced")),
        settings_summary=_settings_summary(snapshot),
        refresh_version=feed.refresh_version,
        generated_at=feed.generated_at,
        refreshed_at=feed.refreshed_at,
        warning=feed.warning,
        primary_problem_completed=bool(progress and progress.status == "solved"),
        primary_problem_needs_review=bool(progress and progress.needs_review),
        primary_problem_attempt_count=progress.attempt_count if progress else 0,
    )


def _generate_daily_feed(
    db: Session,
    settings: AlgorithmDailyRecommendationSettings,
    recommendation_date: str,
    existing: AlgorithmDailyFeed | None,
) -> AlgorithmDailyFeedRead:
    refresh_version = (existing.refresh_version + 1) if existing else 0
    selected, warning = _daily_candidates(db, settings, recommendation_date, refresh_version)
    if not selected:
        raise AlgorithmPracticeError("当前题库没有可用于每日推荐的题目。")
    now = utc_now()
    snapshot = _settings_snapshot(settings)
    if existing is None:
        existing = AlgorithmDailyFeed(
            recommendation_date=recommendation_date,
            primary_problem_id=selected[0].id,
            extra_problem_ids_json=json.dumps([problem.id for problem in selected[1:]], ensure_ascii=False),
            settings_snapshot_json=json.dumps(snapshot, ensure_ascii=False),
            refresh_version=refresh_version,
            warning=warning,
            generated_at=now,
        )
        db.add(existing)
    else:
        existing.primary_problem_id = selected[0].id
        existing.extra_problem_ids_json = json.dumps([problem.id for problem in selected[1:]], ensure_ascii=False)
        existing.settings_snapshot_json = json.dumps(snapshot, ensure_ascii=False)
        existing.refresh_version = refresh_version
        existing.warning = warning
        existing.refreshed_at = now
    db.commit()
    db.refresh(existing)
    return _daily_feed_read(db, existing)


def get_daily_feed(db: Session) -> AlgorithmDailyFeedRead:
    recommendation_date = utc_now().date().isoformat()
    settings = get_daily_recommendation_settings(db)
    if settings is None:
        get_daily_settings(db)
        settings = get_daily_recommendation_settings(db)
    assert settings is not None
    feed = get_daily_feed_record(db, recommendation_date)
    if feed is None:
        return _generate_daily_feed(db, settings, recommendation_date, None)
    try:
        return _daily_feed_read(db, feed)
    except AlgorithmPracticeError:
        return _generate_daily_feed(db, settings, recommendation_date, feed)


def refresh_daily_feed(db: Session) -> AlgorithmDailyFeedRead:
    recommendation_date = utc_now().date().isoformat()
    settings = get_daily_recommendation_settings(db)
    if settings is None:
        get_daily_settings(db)
        settings = get_daily_recommendation_settings(db)
    assert settings is not None
    return _generate_daily_feed(db, settings, recommendation_date, get_daily_feed_record(db, recommendation_date))


def daily_problem(db: Session) -> AlgorithmProblemRead:
    return get_daily_feed(db).primary_problem


def algorithm_catalog_overview(db: Session) -> AlgorithmCatalogOverviewRead:
    problems = list_all_problems(db)
    progress = progress_by_problem(db, [problem.id for problem in problems])
    due_ids = _due_problem_ids(db, utc_now())
    difficulty_counts = {difficulty: sum(problem.difficulty == difficulty for problem in problems) for difficulty in ("easy", "medium", "hard")}
    source_counts: dict[str, int] = defaultdict(int)
    topic_counts: dict[str, int] = defaultdict(int)
    for problem in problems:
        for source in problem.source_lists:
            source_counts[source] += 1
        for topic in problem.topics:
            topic_counts[topic] += 1
    return AlgorithmCatalogOverviewRead(
        total_problem_count=len(problems),
        active_problem_count=sum(problem.is_active for problem in problems),
        completed_problem_count=sum(record.status == "solved" for record in progress.values()),
        due_review_count=len(due_ids),
        difficulty_counts=difficulty_counts,
        source_list_counts=dict(sorted(source_counts.items())),
        topic_counts=dict(sorted(topic_counts.items(), key=lambda item: (-item[1], item[0]))),
    )


def list_catalog_problems(
    db: Session,
    *,
    difficulty: str | None = None,
    pattern: str | None = None,
    topic: str | None = None,
    source_list: str | None = None,
    search: str | None = None,
    completed: bool | None = None,
    needs_review: bool | None = None,
    limit: int = 20,
) -> list[AlgorithmProblemRead]:
    problems = list_active_problems(db)
    progress = progress_by_problem(db, [problem.id for problem in problems])
    search_text = (search or "").casefold().strip()
    result: list[AlgorithmProblemRead] = []
    for problem in problems:
        record = progress.get(problem.id)
        is_completed = bool(record and record.status == "solved")
        is_needing_review = bool(record and record.needs_review)
        if difficulty and problem.difficulty != difficulty:
            continue
        if pattern and problem.pattern_key != pattern:
            continue
        if topic and topic not in problem.topics:
            continue
        if source_list and source_list not in problem.source_lists:
            continue
        if search_text and search_text not in " ".join([problem.title, problem.title_zh or "", problem.slug]).casefold():
            continue
        if completed is not None and is_completed != completed:
            continue
        if needs_review is not None and is_needing_review != needs_review:
            continue
        result.append(
            AlgorithmProblemRead.model_validate(problem).model_copy(
                update={"is_completed": is_completed, "needs_review": is_needing_review, "attempt_count": record.attempt_count if record else 0}
            )
        )
        if len(result) >= limit:
            break
    return result


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
