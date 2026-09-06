from __future__ import annotations

import json
import random
from datetime import date as date_type
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.llm import LLMError, evaluate_interview_answer
from app.models import (
    InterviewAnswer,
    InterviewEvaluation,
    InterviewQuestion,
    InterviewQuestionSet,
    InterviewQuestionSetItem,
    InterviewReviewSchedule,
)
from app.repositories import interview_training_repository as repository
from app.schemas import (
    AnswerEvaluation,
    InterviewAnswerCreate,
    InterviewAnswerRead,
    InterviewAnswerSubmissionRead,
    InterviewEvaluationRead,
    InterviewQuestionForTraining,
    InterviewQuestionSetCreate,
    InterviewQuestionSetItemRead,
    InterviewQuestionSetProgressUpdate,
    InterviewQuestionSetRead,
    InterviewQuestionSetSummary,
    InterviewReviewScheduleRead,
    InterviewTrainingDomainStat,
    InterviewTrainingStats,
)
from app.time_utils import app_local_date, app_local_day_end_utc


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def review_interval_days(total_score: float) -> int:
    if total_score < 60:
        return 1
    if total_score < 80:
        return 3
    if total_score < 90:
        return 7
    return 14


def calculate_total_score(evaluation: AnswerEvaluation) -> float:
    return round(
        evaluation.correctness_score * 0.35
        + evaluation.completeness_score * 0.30
        + evaluation.structure_score * 0.20
        + evaluation.oral_clarity_score * 0.15,
        2,
    )


def training_question(question: InterviewQuestion) -> InterviewQuestionForTraining:
    return InterviewQuestionForTraining(
        id=question.id,
        domain=question.domain,
        topic=question.topic,
        difficulty=question.difficulty,
        expected_duration_seconds=question.expected_duration_seconds,
        tags=question.tags,
        question=question.question,
    )


def evaluation_read(evaluation: InterviewEvaluation) -> InterviewEvaluationRead:
    return InterviewEvaluationRead.model_validate(evaluation)


def answer_read(answer: InterviewAnswer) -> InterviewAnswerRead:
    return InterviewAnswerRead.model_validate(answer)


def _advance_question_set(question_set: InterviewQuestionSet, items: list[InterviewQuestionSetItem]) -> None:
    next_item = next((item for item in items if item.status == "pending"), None)
    if next_item is None:
        question_set.current_index = max(question_set.question_count - 1, 0)
        question_set.last_active_question_id = None
        return
    question_set.current_index = next_item.order_index
    question_set.last_active_question_id = next_item.question_id


def create_question_set(db: Session, payload: InterviewQuestionSetCreate) -> tuple[InterviewQuestionSet, str | None]:
    candidates = repository.list_verified_questions(
        db,
        domain=payload.domain,
        topic=payload.topic,
        difficulty=payload.difficulty,
    )
    if not candidates:
        raise ValueError("没有符合筛选条件的已审核题目，请先在审核页确认题目。")

    now = utc_now()
    candidate_ids = [question.id for question in candidates]
    schedules = repository.get_schedules_for_questions(db, candidate_ids)
    latest_answers = repository.get_latest_answer_times(db, candidate_ids)
    due_questions = [
        question
        for question in candidates
        if question.id in schedules and as_utc(schedules[question.id].next_review_at) <= now
    ]
    remaining_questions = [question for question in candidates if question not in due_questions]

    if payload.random_order:
        random.SystemRandom().shuffle(due_questions)
        unanswered_questions = [question for question in remaining_questions if question.id not in latest_answers]
        answered_questions = [question for question in remaining_questions if question.id in latest_answers]
        random.SystemRandom().shuffle(unanswered_questions)
        random.SystemRandom().shuffle(answered_questions)
        remaining_questions = unanswered_questions + answered_questions
    else:
        due_questions.sort(key=lambda question: as_utc(schedules[question.id].next_review_at))
        remaining_questions.sort(
            key=lambda question: (
                question.id in latest_answers,
                as_utc(latest_answers[question.id]) if question.id in latest_answers else datetime.min.replace(tzinfo=timezone.utc),
                question.id,
            )
        )

    ordered_candidates = (due_questions if payload.include_due_reviews else []) + remaining_questions
    if not payload.include_due_reviews:
        ordered_candidates = remaining_questions + due_questions
    selected_questions = ordered_candidates[: payload.question_count]
    if not selected_questions:
        raise ValueError("没有可用于训练的已审核题目。")

    question_set = InterviewQuestionSet(
        date=app_local_date(now).isoformat(),
        domain=payload.domain,
        topic=payload.topic,
        difficulty=payload.difficulty,
        question_count=len(selected_questions),
        status="in_progress",
        current_index=0,
        last_active_question_id=selected_questions[0].id,
        include_due_reviews=payload.include_due_reviews,
        random_order=payload.random_order,
    )
    db.add(question_set)
    db.flush()
    for order_index, question in enumerate(selected_questions):
        db.add(
            InterviewQuestionSetItem(
                question_set_id=question_set.id,
                question_id=question.id,
                order_index=order_index,
                status="pending",
            )
        )
    db.commit()
    db.refresh(question_set)
    message = None
    if len(selected_questions) < payload.question_count:
        message = f"符合条件的已审核题目不足，已创建 {len(selected_questions)} 道题的训练集。"
    return question_set, message


def _set_item_read(db: Session, item: InterviewQuestionSetItem) -> InterviewQuestionSetItemRead | None:
    question = db.get(InterviewQuestion, item.question_id)
    if question is None or not question.is_active:
        return None
    answer = repository.get_latest_answer_for_question_set(db, item.question_set_id, item.question_id)
    evaluation = repository.get_evaluation_for_answer(db, answer.id) if answer else None
    schedule = repository.get_schedule(db, item.question_id)
    return InterviewQuestionSetItemRead(
        id=item.id,
        order_index=item.order_index,
        status=item.status,
        question=training_question(question),
        latest_answer=answer_read(answer) if answer else None,
        latest_evaluation=evaluation_read(evaluation) if evaluation else None,
        next_review_at=as_utc(schedule.next_review_at) if schedule else None,
    )


def get_question_set_read(
    db: Session,
    question_set: InterviewQuestionSet,
    availability_message: str | None = None,
) -> InterviewQuestionSetRead:
    items = repository.list_set_items(db, question_set.id)
    item_reads = [item for item in (_set_item_read(db, item) for item in items) if item is not None]
    current_item = next((item for item in item_reads if item.order_index == question_set.current_index), None)
    if current_item is None:
        current_item = next((item for item in item_reads if item.status == "pending"), None)
    return InterviewQuestionSetRead(
        id=question_set.id,
        date=question_set.date,
        domain=question_set.domain,
        topic=question_set.topic,
        difficulty=question_set.difficulty,
        question_count=question_set.question_count,
        available_question_count=len(items),
        availability_message=availability_message,
        status=question_set.status,
        current_index=question_set.current_index,
        last_active_question_id=question_set.last_active_question_id,
        include_due_reviews=question_set.include_due_reviews,
        random_order=question_set.random_order,
        created_at=as_utc(question_set.created_at),
        started_at=as_utc(question_set.started_at),
        last_active_at=as_utc(question_set.last_active_at),
        completed_at=as_utc(question_set.completed_at) if question_set.completed_at else None,
        abandoned_at=as_utc(question_set.abandoned_at) if question_set.abandoned_at else None,
        updated_at=as_utc(question_set.updated_at),
        items=item_reads,
        current_question=current_item.question if current_item else None,
    )


def skip_current_question(db: Session, question_set: InterviewQuestionSet) -> InterviewQuestionSet:
    if question_set.status != "in_progress":
        raise ValueError("当前训练题集不是进行中状态")
    items = repository.list_set_items(db, question_set.id)
    current = next((item for item in items if item.order_index == question_set.current_index and item.status == "pending"), None)
    if current is None:
        raise ValueError("当前没有可跳过的题目")
    current.status = "skipped"
    _advance_question_set(question_set, items)
    question_set.last_active_at = utc_now()
    db.commit()
    db.refresh(question_set)
    return question_set


def save_answer(
    db: Session,
    question_set: InterviewQuestionSet,
    payload: InterviewAnswerCreate,
    *,
    retry: bool = False,
) -> InterviewAnswer:
    item = repository.get_set_item(db, question_set.id, payload.question_id)
    if item is None:
        raise ValueError("该题目不属于当前训练题集")
    if question_set.status != "in_progress":
        raise ValueError("训练题集已结束，不能继续提交回答")
    existing = repository.get_latest_answer_for_question_set(db, question_set.id, payload.question_id)
    if existing is not None and not retry:
        raise ValueError("该题已提交回答；如需保留历史版本，请使用重新回答功能")
    if not retry and item.status != "pending":
        raise ValueError("该题目当前不可提交")

    answer = InterviewAnswer(
        question_set_id=question_set.id,
        question_id=payload.question_id,
        attempt_index=(existing.attempt_index + 1) if existing else 1,
        answer_text=payload.answer_text,
        answer_source=payload.answer_source,
        duration_seconds=payload.duration_seconds,
    )
    db.add(answer)
    item.status = "answered"
    items = repository.list_set_items(db, question_set.id)
    _advance_question_set(question_set, items)
    question_set.last_active_at = utc_now()
    db.commit()
    db.refresh(answer)
    return answer


def _upsert_review_schedule(db: Session, answer: InterviewAnswer, total_score: float) -> InterviewReviewSchedule:
    interval_days = review_interval_days(total_score)
    schedule = repository.get_schedule(db, answer.question_id)
    if schedule is None:
        schedule = InterviewReviewSchedule(
            question_id=answer.question_id,
            last_answer_id=answer.id,
            last_score=total_score,
            next_review_at=utc_now() + timedelta(days=interval_days),
            review_interval_days=interval_days,
            review_count=1,
        )
        db.add(schedule)
    else:
        schedule.last_answer_id = answer.id
        schedule.last_score = total_score
        schedule.next_review_at = utc_now() + timedelta(days=interval_days)
        schedule.review_interval_days = interval_days
        schedule.review_count += 1
    return schedule


async def evaluate_answer(db: Session, answer: InterviewAnswer) -> tuple[InterviewEvaluation, InterviewReviewSchedule]:
    existing = repository.get_evaluation_for_answer(db, answer.id)
    if existing is not None:
        schedule = repository.get_schedule(db, answer.question_id)
        if schedule is None:
            raise ValueError("已有评价但缺少复习计划")
        return existing, schedule
    question = db.get(InterviewQuestion, answer.question_id)
    if question is None:
        raise ValueError("回答关联的题目不存在")

    evaluation, raw_json = await evaluate_interview_answer(question, answer.answer_text)
    total_score = calculate_total_score(evaluation)
    stored = InterviewEvaluation(
        answer_id=answer.id,
        correctness_score=evaluation.correctness_score,
        completeness_score=evaluation.completeness_score,
        structure_score=evaluation.structure_score,
        oral_clarity_score=evaluation.oral_clarity_score,
        total_score=total_score,
        matched_points_json=json.dumps(evaluation.matched_points, ensure_ascii=False),
        incorrect_points_json=json.dumps(evaluation.incorrect_points, ensure_ascii=False),
        missing_points_json=json.dumps(evaluation.missing_points, ensure_ascii=False),
        improved_answer=evaluation.improved_answer,
        follow_up_questions_json=json.dumps(evaluation.follow_up_questions, ensure_ascii=False),
        ai_raw_json=raw_json,
        model_name=settings.llm_model,
    )
    db.add(stored)
    schedule = _upsert_review_schedule(db, answer, total_score)
    db.commit()
    db.refresh(stored)
    db.refresh(schedule)
    return stored, schedule


async def submit_and_evaluate(
    db: Session,
    question_set: InterviewQuestionSet,
    payload: InterviewAnswerCreate,
    *,
    retry: bool = False,
) -> InterviewAnswerSubmissionRead:
    answer = save_answer(db, question_set, payload, retry=retry)
    try:
        evaluation, schedule = await evaluate_answer(db, answer)
    except LLMError as exc:
        return InterviewAnswerSubmissionRead(
            answer=answer_read(answer),
            evaluation=None,
            evaluation_status="failed",
            evaluation_error=str(exc),
            next_review_at=None,
        )
    return InterviewAnswerSubmissionRead(
        answer=answer_read(answer),
        evaluation=evaluation_read(evaluation),
        evaluation_status="completed",
        evaluation_error=None,
        next_review_at=as_utc(schedule.next_review_at),
    )


async def retry_evaluation(db: Session, answer: InterviewAnswer) -> InterviewAnswerSubmissionRead:
    try:
        evaluation, schedule = await evaluate_answer(db, answer)
    except LLMError as exc:
        return InterviewAnswerSubmissionRead(
            answer=answer_read(answer),
            evaluation=None,
            evaluation_status="failed",
            evaluation_error=str(exc),
        )
    return InterviewAnswerSubmissionRead(
        answer=answer_read(answer),
        evaluation=evaluation_read(evaluation),
        evaluation_status="completed",
        next_review_at=as_utc(schedule.next_review_at),
    )


def update_question_set_progress(
    db: Session,
    question_set: InterviewQuestionSet,
    payload: InterviewQuestionSetProgressUpdate,
) -> InterviewQuestionSet:
    if question_set.status != "in_progress":
        raise ValueError("已结束的训练不能再更新进度")
    items = repository.list_set_items(db, question_set.id)
    target = next((item for item in items if item.order_index == payload.current_index), None)
    if target is None:
        raise ValueError("current_index 超出当前训练题集范围")
    if payload.last_active_question_id and payload.last_active_question_id != target.question_id:
        raise ValueError("last_active_question_id 与 current_index 不匹配")
    question_set.current_index = target.order_index
    question_set.last_active_question_id = target.question_id
    question_set.last_active_at = utc_now()
    db.commit()
    db.refresh(question_set)
    return question_set


def complete_question_set(db: Session, question_set: InterviewQuestionSet) -> InterviewQuestionSet:
    if question_set.status == "completed":
        return question_set
    if question_set.status != "in_progress":
        raise ValueError("已放弃的训练不能标记为完成")
    if any(item.status == "pending" for item in repository.list_set_items(db, question_set.id)):
        raise ValueError("仍有未完成题目，不能结束训练")
    now = utc_now()
    question_set.status = "completed"
    question_set.completed_at = now
    question_set.last_active_question_id = None
    question_set.last_active_at = now
    db.commit()
    db.refresh(question_set)
    return question_set


def abandon_question_set(db: Session, question_set: InterviewQuestionSet) -> InterviewQuestionSet:
    if question_set.status != "in_progress":
        raise ValueError("只有进行中的训练可以放弃")
    now = utc_now()
    question_set.status = "abandoned"
    question_set.abandoned_at = now
    question_set.last_active_at = now
    db.commit()
    db.refresh(question_set)
    return question_set


def restart_question_set(db: Session, question_set: InterviewQuestionSet) -> tuple[InterviewQuestionSet, str | None]:
    payload = InterviewQuestionSetCreate(
        domain=question_set.domain,
        topic=question_set.topic,
        difficulty=question_set.difficulty,
        question_count=question_set.question_count,
        include_due_reviews=question_set.include_due_reviews,
        random_order=question_set.random_order,
    )
    return create_question_set(db, payload)


def delete_question_set(db: Session, question_set: InterviewQuestionSet) -> None:
    """Remove a local training record without touching its reusable question bank entries."""
    answers = repository.list_answers_for_set(db, question_set.id)
    affected_question_ids = {answer.question_id for answer in answers}
    for answer in answers:
        evaluation = repository.get_evaluation_for_answer(db, answer.id)
        if evaluation is not None:
            db.delete(evaluation)
        db.delete(answer)

    for question_id in affected_question_ids:
        schedule = repository.get_schedule(db, question_id)
        if schedule is None:
            continue
        replacement = repository.get_latest_answer_for_question(
            db, question_id, excluding_question_set_id=question_set.id
        )
        replacement_evaluation = (
            repository.get_evaluation_for_answer(db, replacement.id) if replacement is not None else None
        )
        if replacement is None or replacement_evaluation is None:
            db.delete(schedule)
            continue
        schedule.last_answer_id = replacement.id
        schedule.last_score = replacement_evaluation.total_score
        schedule.review_interval_days = review_interval_days(replacement_evaluation.total_score)
        schedule.next_review_at = utc_now() + timedelta(days=schedule.review_interval_days)

    for item in repository.list_set_items(db, question_set.id):
        db.delete(item)
    db.delete(question_set)
    db.commit()


def list_question_set_summaries(
    db: Session,
    limit: int,
    *,
    status: str | None = None,
) -> list[InterviewQuestionSetSummary]:
    summaries: list[InterviewQuestionSetSummary] = []
    for question_set in repository.list_question_sets(db, limit, status=status):
        items = repository.list_set_items(db, question_set.id)
        answers = repository.list_answers_for_set(db, question_set.id)
        evaluations = [
            evaluation
            for answer in answers
            if (evaluation := repository.get_evaluation_for_answer(db, answer.id)) is not None
        ]
        average_score = sum(evaluation.total_score for evaluation in evaluations) / len(evaluations) if evaluations else None
        summaries.append(
            InterviewQuestionSetSummary(
                id=question_set.id,
                date=question_set.date,
                domain=question_set.domain,
                topic=question_set.topic,
                difficulty=question_set.difficulty,
                question_count=question_set.question_count,
                answered_count=sum(item.status == "answered" for item in items),
                skipped_count=sum(item.status == "skipped" for item in items),
                status=question_set.status,
                average_score=round(float(average_score), 2) if average_score is not None else None,
                created_at=as_utc(question_set.created_at),
                last_active_at=as_utc(question_set.last_active_at),
                completed_at=as_utc(question_set.completed_at) if question_set.completed_at else None,
                abandoned_at=as_utc(question_set.abandoned_at) if question_set.abandoned_at else None,
            )
        )
    return summaries


def get_training_stats(db: Session) -> InterviewTrainingStats:
    question_sets = repository.list_question_sets_for_stats(db)
    all_items: list[tuple[InterviewQuestionSet, InterviewQuestionSetItem]] = []
    answer_dates: set[date_type] = set()
    today_answered_count = 0
    evaluations: list[InterviewEvaluation] = []
    domains: dict[str, dict[str, list[float] | int]] = {}
    now = utc_now()
    today = app_local_date(now)

    for question_set in question_sets:
        for answer in repository.list_answers_for_set(db, question_set.id):
            answer_dates.add(app_local_date(answer.created_at))
        for item in repository.list_set_items(db, question_set.id):
            all_items.append((question_set, item))
            if item.status != "answered":
                continue
            answer = repository.get_latest_answer_for_question_set(db, question_set.id, item.question_id)
            if answer is None:
                continue
            if app_local_date(answer.created_at) == today:
                today_answered_count += 1
            evaluation = repository.get_evaluation_for_answer(db, answer.id)
            if evaluation is not None:
                evaluations.append(evaluation)
            question = db.get(InterviewQuestion, item.question_id)
            if question is None:
                continue
            bucket = domains.setdefault(question.domain, {"answered": 0, "scores": []})
            bucket["answered"] = int(bucket["answered"]) + 1
            if evaluation is not None:
                scores = bucket["scores"]
                assert isinstance(scores, list)
                scores.append(evaluation.total_score)

    streak_days = 0
    cursor = today
    while cursor in answer_dates:
        streak_days += 1
        cursor -= timedelta(days=1)

    due_review_count = len(repository.list_due_schedules(db, due_before=now, domain=None, limit=10000))
    recent_scores = [evaluation.total_score for evaluation in sorted(evaluations, key=lambda value: value.created_at, reverse=True)[:20]]
    domain_stats = [
        InterviewTrainingDomainStat(
            domain=domain,
            answered_count=int(bucket["answered"]),
            average_score=round(sum(scores) / len(scores), 2) if (scores := bucket["scores"]) else None,
        )
        for domain, bucket in sorted(domains.items())
    ]
    return InterviewTrainingStats(
        streak_days=streak_days,
        today_answered_count=today_answered_count,
        total_answered_count=sum(1 for _, item in all_items if item.status == "answered"),
        due_review_count=due_review_count,
        recent_average_score=round(sum(recent_scores) / len(recent_scores), 2) if recent_scores else None,
        in_progress_count=sum(question_set.status == "in_progress" for question_set in question_sets),
        last_training_at=as_utc(question_sets[0].last_active_at) if question_sets else None,
        domains=domain_stats,
    )


def list_due_reviews(
    db: Session,
    *,
    date: str | None,
    domain: str | None,
    limit: int,
) -> list[InterviewReviewScheduleRead]:
    if date:
        try:
            due_date = date_type.fromisoformat(date)
        except ValueError as exc:
            raise ValueError("date 必须使用 YYYY-MM-DD 格式") from exc
        due_before = app_local_day_end_utc(due_date)
    else:
        due_before = utc_now()
    rows = repository.list_due_schedules(db, due_before=due_before, domain=domain, limit=limit)
    return [
        InterviewReviewScheduleRead(
            id=schedule.id,
            question_id=schedule.question_id,
            last_answer_id=schedule.last_answer_id,
            last_score=schedule.last_score,
            next_review_at=as_utc(schedule.next_review_at),
            review_interval_days=schedule.review_interval_days,
            review_count=schedule.review_count,
            question=training_question(question),
        )
        for schedule, question in rows
    ]
