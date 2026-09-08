from datetime import datetime, timezone
import json

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Diary(Base):
    __tablename__ = "diaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[str] = mapped_column(String(10), index=True)
    title: Mapped[str] = mapped_column(String(160))
    raw_text: Mapped[str] = mapped_column(Text)
    polished_text: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    tags_json: Mapped[str] = mapped_column("tags", Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def tags(self) -> list[str]:
        try:
            value = json.loads(self.tags_json or "[]")
        except json.JSONDecodeError:
            return []

        if not isinstance(value, list):
            return []

        return [str(item) for item in value if str(item).strip()]


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    reminder_time: Mapped[str] = mapped_column(String(5), default="21:30")
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Shanghai")
    interview_goal: Mapped[int] = mapped_column(Integer, default=3)
    algorithm_goal: Mapped[int] = mapped_column(Integer, default=3)
    include_diary: Mapped[bool] = mapped_column(Boolean, default=True)
    include_review: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_local_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AlgorithmProblem(Base):
    """Local metadata for an externally hosted algorithm problem."""

    __tablename__ = "algorithm_problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stable_key: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(40), index=True)
    external_id: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(String(320))
    title_zh: Mapped[str | None] = mapped_column(String(320), nullable=True)
    slug: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    url: Mapped[str] = mapped_column(String(600))
    difficulty: Mapped[str] = mapped_column(String(20), index=True)
    pattern_key: Mapped[str] = mapped_column(String(80), index=True)
    topics_json: Mapped[str] = mapped_column("topics", Text, default="[]")
    source_lists_json: Mapped[str] = mapped_column("source_lists", Text, default="[]")
    source_name: Mapped[str] = mapped_column(String(200))
    source_license: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @staticmethod
    def _json_list(value: str) -> list[str]:
        try:
            decoded = json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
        return [str(item) for item in decoded] if isinstance(decoded, list) else []

    @property
    def topics(self) -> list[str]:
        return self._json_list(self.topics_json)

    @property
    def source_lists(self) -> list[str]:
        return self._json_list(self.source_lists_json)


class AlgorithmPracticeSession(Base):
    """A persisted algorithm training run with a fixed problem order."""

    __tablename__ = "algorithm_practice_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mode: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(20), default="in_progress", index=True)
    requested_count: Mapped[int] = mapped_column(Integer)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    filters_json: Mapped[str] = mapped_column("filters", Text, default="{}")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    abandoned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def filters(self) -> dict[str, object]:
        try:
            value = json.loads(self.filters_json or "{}")
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}


class AlgorithmPracticeSessionItem(Base):
    __tablename__ = "algorithm_practice_session_items"
    __table_args__ = (
        UniqueConstraint("session_id", "position", name="uq_algorithm_session_item_position"),
        UniqueConstraint("session_id", "problem_id", name="uq_algorithm_session_item_problem"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("algorithm_practice_sessions.id", ondelete="CASCADE"), index=True
    )
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    skipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AlgorithmAttempt(Base):
    __tablename__ = "algorithm_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), index=True)
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("algorithm_practice_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    session_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("algorithm_practice_session_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[str] = mapped_column(String(24), index=True)
    language: Mapped[str | None] = mapped_column(String(48), nullable=True)
    approach: Mapped[str] = mapped_column(Text, default="")
    time_complexity: Mapped[str | None] = mapped_column(String(160), nullable=True)
    space_complexity: Mapped[str | None] = mapped_column(String(160), nullable=True)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    mistakes: Mapped[str | None] = mapped_column(Text, nullable=True)
    edge_cases: Mapped[str | None] = mapped_column(Text, nullable=True)
    hint_count: Mapped[int] = mapped_column(Integer, default=0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ai_feedback_json: Mapped[str | None] = mapped_column("ai_feedback", Text, nullable=True)
    ai_feedback_status: Mapped[str] = mapped_column(String(20), default="not_requested", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def ai_feedback(self) -> dict[str, object] | None:
        if not self.ai_feedback_json:
            return None
        try:
            value = json.loads(self.ai_feedback_json)
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None


class AlgorithmReviewSchedule(Base):
    __tablename__ = "algorithm_review_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), unique=True, index=True)
    last_attempt_id: Mapped[int] = mapped_column(ForeignKey("algorithm_attempts.id"), index=True)
    next_review_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    interval_days: Mapped[int] = mapped_column(Integer)
    review_count: Mapped[int] = mapped_column(Integer, default=1)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AlgorithmProblemProgress(Base):
    __tablename__ = "algorithm_problem_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), default="unseen", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    solved_count: Mapped[int] = mapped_column(Integer, default=0)
    best_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_result: Mapped[str | None] = mapped_column(String(24), nullable=True)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AlgorithmProblemContext(Base):
    """Versioned mobile reasoning context for an algorithm problem."""

    __tablename__ = "algorithm_problem_contexts"
    __table_args__ = (
        UniqueConstraint("problem_id", "content_version", name="uq_algorithm_context_problem_version"),
        UniqueConstraint("problem_id", "content_hash", name="uq_algorithm_context_problem_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), index=True)
    problem_key: Mapped[str] = mapped_column(String(160), index=True)
    schema_version: Mapped[int] = mapped_column(Integer)
    content_version: Mapped[int] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    context_json: Mapped[str] = mapped_column("context", Text)
    content_status: Mapped[str] = mapped_column(String(20), default="ready", index=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    content_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def context(self) -> dict[str, object]:
        try:
            value = json.loads(self.context_json or "{}")
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}


class AlgorithmReasoningAnswer(Base):
    """A saved mobile reasoning answer version, independent from LLM feedback."""

    __tablename__ = "algorithm_reasoning_answers"
    __table_args__ = (UniqueConstraint("client_answer_id", name="uq_algorithm_reasoning_client_answer"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), index=True)
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("algorithm_practice_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    session_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("algorithm_practice_session_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    revision_of_answer_id: Mapped[int | None] = mapped_column(
        ForeignKey("algorithm_reasoning_answers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    answer_text: Mapped[str] = mapped_column(Text)
    answer_source: Mapped[str] = mapped_column(String(20), default="text")
    details_json: Mapped[str] = mapped_column("details", Text, default="{}")
    client_answer_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def details(self) -> dict[str, object]:
        try:
            value = json.loads(self.details_json or "{}")
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}


class AlgorithmReasoningFeedback(Base):
    """Structured LLM feedback bound to exactly one saved answer version."""

    __tablename__ = "algorithm_reasoning_feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer_id: Mapped[int] = mapped_column(
        ForeignKey("algorithm_reasoning_answers.id", ondelete="CASCADE"), unique=True, index=True
    )
    problem_context_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problem_contexts.id"), index=True)
    synced_attempt_id: Mapped[int | None] = mapped_column(ForeignKey("algorithm_attempts.id"), nullable=True, index=True)
    conclusion: Mapped[str] = mapped_column(String(32), index=True)
    headline: Mapped[str] = mapped_column(Text)
    context_sufficient: Mapped[bool] = mapped_column(Boolean, default=True)
    feedback_json: Mapped[str] = mapped_column("feedback", Text)
    model_name: Mapped[str] = mapped_column(String(160))
    prompt_version: Mapped[str] = mapped_column(String(80))
    context_version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def feedback(self) -> dict[str, object]:
        try:
            value = json.loads(self.feedback_json or "{}")
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}


class AlgorithmDailyRecommendationSettings(Base):
    __tablename__ = "algorithm_daily_recommendation_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    strategy: Mapped[str] = mapped_column(String(32), default="balanced")
    topics_json: Mapped[str] = mapped_column("topics", Text, default="[]")
    difficulties_json: Mapped[str] = mapped_column("difficulties", Text, default="[]")
    source_lists_json: Mapped[str] = mapped_column("source_lists", Text, default="[]")
    exclude_solved: Mapped[bool] = mapped_column(Boolean, default=False)
    prioritize_due_review: Mapped[bool] = mapped_column(Boolean, default=True)
    avoid_recent_days: Mapped[int] = mapped_column(Integer, default=14)
    extra_recommendation_count: Mapped[int] = mapped_column(Integer, default=6)
    include_adjacent_difficulty: Mapped[bool] = mapped_column(Boolean, default=False)
    include_review_items: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @staticmethod
    def _json_list(value: str) -> list[str]:
        try:
            decoded = json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
        return [str(item) for item in decoded] if isinstance(decoded, list) else []

    @property
    def topics(self) -> list[str]:
        return self._json_list(self.topics_json)

    @property
    def difficulties(self) -> list[str]:
        return self._json_list(self.difficulties_json)

    @property
    def source_lists(self) -> list[str]:
        return self._json_list(self.source_lists_json)


class AlgorithmDailyFeed(Base):
    __tablename__ = "algorithm_daily_feeds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recommendation_date: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    primary_problem_id: Mapped[int] = mapped_column(ForeignKey("algorithm_problems.id"), index=True)
    extra_problem_ids_json: Mapped[str] = mapped_column("extra_problem_ids", Text, default="[]")
    settings_snapshot_json: Mapped[str] = mapped_column("settings_snapshot", Text, default="{}")
    refresh_version: Mapped[int] = mapped_column(Integer, default=0)
    warning: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def extra_problem_ids(self) -> list[int]:
        try:
            decoded = json.loads(self.extra_problem_ids_json or "[]")
        except json.JSONDecodeError:
            return []
        return [int(item) for item in decoded if str(item).isdigit()]

    @property
    def settings_snapshot(self) -> dict[str, object]:
        try:
            decoded = json.loads(self.settings_snapshot_json or "{}")
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}


class InterviewQuestion(Base):
    """Auditable interview question content used by future training flows."""

    __tablename__ = "interview_questions"

    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    domain: Mapped[str] = mapped_column(String(80), index=True)
    topic: Mapped[str] = mapped_column(String(100), index=True)
    subtopic: Mapped[str] = mapped_column(String(120))
    question: Mapped[str] = mapped_column(Text)
    question_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    difficulty: Mapped[str] = mapped_column(String(20), index=True)
    question_type: Mapped[str] = mapped_column(String(80))
    expected_duration_seconds: Mapped[int] = mapped_column(Integer)
    tags_json: Mapped[str] = mapped_column("tags", Text, default="[]")
    reference_points_json: Mapped[str] = mapped_column("reference_points", Text, default="[]")
    evaluation_rubric_json: Mapped[str] = mapped_column("evaluation_rubric", Text, default="[]")
    common_mistakes_json: Mapped[str] = mapped_column("common_mistakes", Text, default="[]")
    oral_answer_outline_json: Mapped[str] = mapped_column("oral_answer_outline", Text, default="[]")
    reference_answer: Mapped[str] = mapped_column(Text)
    follow_up_questions_json: Mapped[str] = mapped_column("follow_up_questions", Text, default="[]")
    sources_json: Mapped[str] = mapped_column("sources", Text, default="[]")
    review_status: Mapped[str] = mapped_column(String(20), index=True, default="pending")
    verified_by_human: Mapped[bool] = mapped_column(Boolean, default=False)
    human_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_method: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    review_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    ai_review_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def _json_list(self, value: str) -> list[object]:
        try:
            decoded = json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
        return decoded if isinstance(decoded, list) else []

    @property
    def tags(self) -> list[str]:
        return [str(item) for item in self._json_list(self.tags_json)]

    @property
    def reference_points(self) -> list[str]:
        return [str(item) for item in self._json_list(self.reference_points_json)]

    @property
    def evaluation_rubric(self) -> list[dict[str, object]]:
        return [item for item in self._json_list(self.evaluation_rubric_json) if isinstance(item, dict)]

    @property
    def common_mistakes(self) -> list[str]:
        return [str(item) for item in self._json_list(self.common_mistakes_json)]

    @property
    def oral_answer_outline(self) -> list[str]:
        return [str(item) for item in self._json_list(self.oral_answer_outline_json)]

    @property
    def follow_up_questions(self) -> list[str]:
        return [str(item) for item in self._json_list(self.follow_up_questions_json)]

    @property
    def sources(self) -> list[dict[str, object]]:
        return [item for item in self._json_list(self.sources_json) if isinstance(item, dict)]

    @property
    def ai_review(self) -> dict[str, object] | None:
        if not self.ai_review_json:
            return None
        try:
            value = json.loads(self.ai_review_json)
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, dict) else None


class InterviewBatchJob(Base):
    __tablename__ = "interview_batch_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="queued")
    auto_publish: Mapped[bool] = mapped_column(Boolean, default=False)
    total: Mapped[int] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def type(self) -> str:
        return self.job_type


class InterviewBatchJobItem(Base):
    __tablename__ = "interview_batch_job_items"
    __table_args__ = (UniqueConstraint("job_id", "question_id", name="uq_interview_batch_job_question"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("interview_batch_jobs.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str] = mapped_column(ForeignKey("interview_questions.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InterviewQuestionSet(Base):
    __tablename__ = "interview_question_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[str] = mapped_column(String(10), index=True)
    domain: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    topic: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    question_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="in_progress", index=True)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    last_active_question_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    include_due_reviews: Mapped[bool] = mapped_column(Boolean, default=True)
    random_order: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    abandoned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class InterviewQuestionSetItem(Base):
    __tablename__ = "interview_question_set_items"
    __table_args__ = (
        UniqueConstraint("question_set_id", "order_index", name="uq_interview_set_order"),
        UniqueConstraint("question_set_id", "question_id", name="uq_interview_set_question"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_set_id: Mapped[int] = mapped_column(
        ForeignKey("interview_question_sets.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str] = mapped_column(ForeignKey("interview_questions.id"), index=True)
    order_index: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"
    __table_args__ = (UniqueConstraint("question_set_id", "question_id", "attempt_index", name="uq_interview_answer_attempt"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_set_id: Mapped[int] = mapped_column(
        ForeignKey("interview_question_sets.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str] = mapped_column(ForeignKey("interview_questions.id"), index=True)
    attempt_index: Mapped[int] = mapped_column(Integer, default=1)
    answer_text: Mapped[str] = mapped_column(Text)
    answer_source: Mapped[str] = mapped_column(String(20))
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evaluation_status: Mapped[str] = mapped_column(String(20), default="processing", index=True)
    evaluation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class InterviewEvaluation(Base):
    __tablename__ = "interview_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("interview_answers.id", ondelete="CASCADE"), unique=True, index=True)
    correctness_score: Mapped[int] = mapped_column(Integer)
    completeness_score: Mapped[int] = mapped_column(Integer)
    structure_score: Mapped[int] = mapped_column(Integer)
    oral_clarity_score: Mapped[int] = mapped_column(Integer)
    total_score: Mapped[float] = mapped_column(Float)
    matched_points_json: Mapped[str] = mapped_column("matched_points", Text, default="[]")
    incorrect_points_json: Mapped[str] = mapped_column("incorrect_points", Text, default="[]")
    missing_points_json: Mapped[str] = mapped_column("missing_points", Text, default="[]")
    improved_answer: Mapped[str] = mapped_column(Text)
    follow_up_questions_json: Mapped[str] = mapped_column("follow_up_questions", Text, default="[]")
    ai_raw_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    def _json_list(self, value: str) -> list[str]:
        try:
            decoded = json.loads(value or "[]")
        except json.JSONDecodeError:
            return []
        return [str(item) for item in decoded] if isinstance(decoded, list) else []

    @property
    def matched_points(self) -> list[str]:
        return self._json_list(self.matched_points_json)

    @property
    def incorrect_points(self) -> list[str]:
        return self._json_list(self.incorrect_points_json)

    @property
    def missing_points(self) -> list[str]:
        return self._json_list(self.missing_points_json)

    @property
    def follow_up_questions(self) -> list[str]:
        return self._json_list(self.follow_up_questions_json)


class InterviewReviewSchedule(Base):
    __tablename__ = "interview_review_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("interview_questions.id"), unique=True, index=True)
    last_answer_id: Mapped[int] = mapped_column(ForeignKey("interview_answers.id"), index=True)
    last_score: Mapped[float] = mapped_column(Float)
    next_review_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    review_interval_days: Mapped[int] = mapped_column(Integer)
    review_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class StudySession(Base):
    """A small, source-agnostic record of focused study time.

    Algorithm and interview practice keep their own rich session models.  This
    model intentionally tracks only the cross-feature timer used by the
    desktop companion, so neither workflow needs to be coupled to it.
    """

    __tablename__ = "study_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    client_event_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    activity_type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(160), default="自主学习")
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accumulated_seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class DesktopPetSettings(Base):
    """Singleton server-side settings shared by the web app and desktop pet."""

    __tablename__ = "desktop_pet_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    weather_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    location_label: Mapped[str] = mapped_column(String(120), default="")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_refresh_minutes: Mapped[int] = mapped_column(Integer, default=15)
    milestone_minutes_json: Mapped[str] = mapped_column("milestone_minutes", Text, default="[10, 20, 50]")
    milestone_display_seconds: Mapped[int] = mapped_column(Integer, default=10)
    show_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    open_page_on_study_start: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @property
    def milestone_minutes(self) -> list[int]:
        try:
            values = json.loads(self.milestone_minutes_json or "[]")
        except json.JSONDecodeError:
            return [10, 20, 50]
        if not isinstance(values, list):
            return [10, 20, 50]
        return [int(value) for value in values if isinstance(value, int) and value > 0]


class DesktopPetControl(Base):
    """Singleton command state shared by the browser and the desktop pet.

    Visibility is deliberately kept outside ``DesktopPetSettings``: it is a
    short-lived command which needs a desktop-side acknowledgement, not a
    preference that should be restored on the next app launch.
    """

    __tablename__ = "desktop_pet_control"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    show_request_version: Mapped[int] = mapped_column(Integer, default=0)
    show_acknowledged_version: Mapped[int] = mapped_column(Integer, default=0)
    show_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    desktop_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
