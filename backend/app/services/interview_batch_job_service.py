from __future__ import annotations

import asyncio
from collections import Counter
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.llm import LLMError
from app.models import InterviewBatchJob, InterviewBatchJobItem, InterviewQuestion, utc_now
from app.schemas import InterviewBatchJobCreate, InterviewBatchJobRead
from app.services.interview_question_review_service import quick_publish, reject_question, run_ai_review


def create_batch_job(db: Session, payload: InterviewBatchJobCreate) -> InterviewBatchJob:
    job = InterviewBatchJob(
        id=str(uuid4()),
        job_type=payload.type,
        status="queued",
        auto_publish=payload.auto_publish if payload.type == "ai_review" else False,
        total=len(payload.question_ids),
    )
    db.add(job)
    db.add_all(
        InterviewBatchJobItem(job_id=job.id, question_id=question_id, status="pending")
        for question_id in payload.question_ids
    )
    db.commit()
    db.refresh(job)
    return job


def get_batch_job(db: Session, job_id: str) -> InterviewBatchJob | None:
    return db.get(InterviewBatchJob, job_id)


def _job_items(db: Session, job_id: str) -> list[InterviewBatchJobItem]:
    return list(
        db.scalars(
            select(InterviewBatchJobItem)
            .where(InterviewBatchJobItem.job_id == job_id)
            .order_by(InterviewBatchJobItem.id)
        ).all()
    )


def serialize_batch_job(db: Session, job: InterviewBatchJob) -> InterviewBatchJobRead:
    items = _job_items(db, job.id)
    statuses = Counter(item.status for item in items)
    outcomes = Counter(item.outcome for item in items)
    return InterviewBatchJobRead(
        id=job.id,
        type=job.job_type,
        status=job.status,
        auto_publish=job.auto_publish,
        total=job.total,
        processed_count=sum(statuses[name] for name in ("succeeded", "skipped", "failed")),
        succeeded_count=statuses["succeeded"],
        skipped_count=statuses["skipped"],
        failed_count=statuses["failed"],
        published_count=outcomes["published"],
        kept_pending_count=outcomes["kept_pending"],
        error=job.error,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        updated_at=job.updated_at,
        items=items,
    )


def list_batch_jobs(db: Session, *, status: str | None, limit: int = 12) -> list[InterviewBatchJobRead]:
    statement = select(InterviewBatchJob).order_by(InterviewBatchJob.created_at.desc()).limit(limit)
    if status:
        statement = statement.where(InterviewBatchJob.status == status)
    return [serialize_batch_job(db, job) for job in db.scalars(statement).all()]


def _finish_item(
    db: Session,
    item: InterviewBatchJobItem,
    *,
    status: str,
    outcome: str | None,
    message: str | None = None,
) -> None:
    item.status = status
    item.outcome = outcome
    item.message = message
    item.completed_at = utc_now()
    db.commit()


async def _process_job_item(job_id: str, item_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(InterviewBatchJob, job_id)
        item = db.get(InterviewBatchJobItem, item_id)
        if job is None or item is None or item.status != "pending":
            return
        item.status = "running"
        item.started_at = utc_now()
        db.commit()

        question = db.get(InterviewQuestion, item.question_id)
        if question is None:
            _finish_item(db, item, status="skipped", outcome="skipped", message="题目不存在")
            return
        if job.job_type == "ai_review":
            if question.review_status == "rejected":
                _finish_item(db, item, status="skipped", outcome="skipped", message="rejected 题目默认跳过")
                return
            if question.review_status == "verified" and question.verified_by_human:
                _finish_item(db, item, status="skipped", outcome="skipped", message="人工精审题目默认跳过")
                return
            review, published = await run_ai_review(db, question, auto_publish=job.auto_publish)
            _finish_item(
                db,
                item,
                status="succeeded",
                outcome="published" if published else "kept_pending",
                message=f"AI 评分 {review.quality_score}",
            )
            return
        if job.job_type == "quick_publish":
            if question.review_status in {"rejected", "verified"}:
                _finish_item(db, item, status="skipped", outcome="skipped", message="题目当前状态无需快速正式化")
                return
            quick_publish(db, question)
            _finish_item(db, item, status="succeeded", outcome="published")
            return
        if job.job_type == "reject":
            if question.review_status == "rejected":
                _finish_item(db, item, status="skipped", outcome="skipped", message="题目已经被拒绝")
                return
            reject_question(db, question)
            _finish_item(db, item, status="succeeded", outcome="reviewed", message="已标记为 rejected")
            return
        _finish_item(db, item, status="failed", outcome=None, message="不支持的批量任务类型")
    except (LLMError, ValueError) as exc:
        db.rollback()
        item = db.get(InterviewBatchJobItem, item_id)
        if item is not None:
            _finish_item(db, item, status="failed", outcome=None, message=str(exc))
    except Exception as exc:  # Keep one bad item from aborting the remainder of a persisted batch job.
        db.rollback()
        item = db.get(InterviewBatchJobItem, item_id)
        if item is not None:
            _finish_item(db, item, status="failed", outcome=None, message=str(exc))
    finally:
        db.close()


def _finalize_job(job_id: str, *, error: str | None = None) -> None:
    db = SessionLocal()
    try:
        job = db.get(InterviewBatchJob, job_id)
        if job is None:
            return
        items = _job_items(db, job_id)
        failures = sum(item.status == "failed" for item in items)
        processed = sum(item.status in {"succeeded", "skipped", "failed"} for item in items)
        if error:
            job.status = "failed"
            job.error = error
        elif failures == len(items):
            job.status = "failed"
        elif failures:
            job.status = "partial_failed"
        elif processed == len(items):
            job.status = "completed"
        else:
            job.status = "failed"
            job.error = "任务未完成，请重新提交"
        job.completed_at = utc_now()
        db.commit()
    finally:
        db.close()


async def run_batch_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(InterviewBatchJob, job_id)
        if job is None or job.status != "queued":
            return
        job.status = "running"
        job.started_at = utc_now()
        db.commit()
        item_ids = [item.id for item in _job_items(db, job_id)]
        job_type = job.job_type
    finally:
        db.close()

    try:
        if job_type == "ai_review":
            semaphore = asyncio.Semaphore(settings.batch_ai_review_concurrency)

            async def run_limited(item_id: int) -> None:
                async with semaphore:
                    await _process_job_item(job_id, item_id)

            await asyncio.gather(*(run_limited(item_id) for item_id in item_ids))
        else:
            for item_id in item_ids:
                await _process_job_item(job_id, item_id)
    except Exception as exc:  # A job-level failure is persisted rather than leaving it in running state.
        _finalize_job(job_id, error=str(exc))
        return
    _finalize_job(job_id)
