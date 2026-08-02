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


class InterviewQuestionSet(Base):
    __tablename__ = "interview_question_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[str] = mapped_column(String(10), index=True)
    domain: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    topic: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    question_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
