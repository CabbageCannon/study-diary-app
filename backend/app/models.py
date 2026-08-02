from datetime import datetime, timezone
import json

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
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
