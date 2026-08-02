from datetime import date as date_type
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator


class DiaryCreate(BaseModel):
    date: str = Field(..., description="学习日期，格式 YYYY-MM-DD")
    raw_text: str = Field(..., description="用户原始学习记录")

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        try:
            date_type.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("date 必须使用有效的 YYYY-MM-DD 日期格式") from exc

        if len(value) != 10:
            raise ValueError("date 不是有效日期")

        return value

    @field_validator("raw_text")
    @classmethod
    def validate_raw_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("raw_text 不能为空")

        return text


class PolishedDiary(BaseModel):
    title: str
    polished_text: str
    summary: str
    tags: list[str]

    @field_validator("title", "polished_text", "summary")
    @classmethod
    def validate_text_field(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("模型返回内容存在空字段")

        return text

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            candidates = [item.strip() for item in value.split(",")]
        elif isinstance(value, list):
            candidates = [str(item).strip() for item in value]
        else:
            candidates = []

        tags: list[str] = []
        for tag in candidates:
            if tag and tag not in tags:
                tags.append(tag)

        if not tags:
            raise ValueError("模型返回的 tags 不能为空")

        return tags[:5]


class DiaryDraftCreate(DiaryCreate):
    pass


class DiaryDraftContent(PolishedDiary):
    pass


class DiaryDraftRewrite(BaseModel):
    date: str = Field(..., description="学习日期，格式 YYYY-MM-DD")
    raw_text: str = Field(..., description="用户原始学习记录")
    current_draft: DiaryDraftContent
    feedback: str = Field(..., description="用户对当前草稿的修改意见")

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return DiaryCreate.validate_date(value)

    @field_validator("raw_text", "feedback")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("内容不能为空")

        return text


class DiaryDraft(PolishedDiary):
    date: str
    raw_text: str


class DiarySave(BaseModel):
    date: str = Field(..., description="学习日期，格式 YYYY-MM-DD")
    title: str
    raw_text: str
    polished_text: str
    summary: str
    tags: list[str]

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return DiaryCreate.validate_date(value)

    @field_validator("title", "raw_text", "polished_text", "summary")
    @classmethod
    def validate_text_field(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("内容不能为空")

        return text

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: Any) -> list[str]:
        return PolishedDiary.normalize_tags(value)


class DiaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: str
    title: str
    raw_text: str
    polished_text: str
    summary: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


Difficulty = Literal["easy", "medium", "hard"]
ReviewStatus = Literal["pending", "verified", "rejected"]
QuestionDomain = Literal["agent", "rag", "llm_application", "python", "network", "ai_engineering"]


class CatalogSource(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    license: str = Field(min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=600)


class AlgorithmProblemSeed(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    platform: str = Field(min_length=1, max_length=40)
    external_id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=320)
    title_zh: str | None = Field(default=None, max_length=320)
    slug: str = Field(min_length=1, max_length=320)
    url: str = Field(min_length=1, max_length=600)
    difficulty: Difficulty
    pattern_key: str = Field(min_length=1, max_length=80)
    topics: list[str] = Field(min_length=1)
    source_lists: list[str] = Field(default_factory=list)
    is_active: bool = True
    source: CatalogSource

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str) -> str:
        slug = value.strip().strip("/").lower()
        if not slug:
            raise ValueError("slug 不能为空")
        return slug

    @field_validator("topics", "source_lists")
    @classmethod
    def unique_string_list(cls, value: list[str], info: ValidationInfo) -> list[str]:
        normalized: list[str] = []
        for item in value:
            text = str(item).strip()
            if text and text not in normalized:
                normalized.append(text)
        if info.field_name == "topics" and not normalized:
            raise ValueError("topics 不能为空")
        return normalized

    @field_validator("title", "platform", "external_id", "pattern_key")
    @classmethod
    def trim_required_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("字段不能为空")
        return value

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        url = value.strip()
        if not url.startswith("https://leetcode.cn/problems/"):
            raise ValueError("算法题 URL 必须是确定性的 leetcode.cn problems 地址")
        return url

    @field_validator("title_zh")
    @classmethod
    def trim_optional_title(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None

    @property
    def stable_key(self) -> str:
        return self.id


class AlgorithmCatalog(BaseModel):
    catalog_version: int = 1
    problems: list[AlgorithmProblemSeed] = Field(default_factory=list)


class InterviewSource(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    url: str = Field(min_length=1, max_length=800)
    source_type: Literal["official_documentation", "specification", "research_paper", "open_source"]
    license: str = Field(min_length=1, max_length=240)
    accessed_at: str = Field(min_length=10, max_length=10)

    @field_validator("url")
    @classmethod
    def validate_source_url(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("来源 URL 必须以 http:// 或 https:// 开头")
        return value


class InterviewSourceReference(BaseModel):
    source_id: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, max_length=240)
    url: str | None = Field(default=None, max_length=800)
    source_type: Literal["official_documentation", "specification", "research_paper", "open_source"] | None = None
    license: str | None = Field(default=None, max_length=240)
    accessed_at: str | None = Field(default=None, max_length=10)


class InterviewQuestionSource(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    url: str = Field(min_length=1, max_length=800)
    source_type: Literal["official_documentation", "specification", "research_paper", "open_source"]
    license: str = Field(min_length=1, max_length=240)
    accessed_at: str = Field(min_length=10, max_length=10)


class EvaluationRubricItem(BaseModel):
    point: str = Field(min_length=1, max_length=500)
    weight: int = Field(ge=1, le=100)
    mandatory: bool = False


class InterviewQuestionSeed(BaseModel):
    id: str = Field(min_length=1, max_length=160, pattern=r"^[a-z0-9][a-z0-9-]*$")
    domain: QuestionDomain
    topic: str = Field(min_length=1, max_length=100)
    subtopic: str = Field(min_length=1, max_length=120)
    question: str = Field(min_length=8, max_length=1000)
    difficulty: Difficulty
    question_type: str = Field(min_length=1, max_length=80)
    expected_duration_seconds: int = Field(ge=30, le=600)
    tags: list[str] = Field(min_length=1)
    reference_points: list[str] = Field(min_length=3)
    evaluation_rubric: list[EvaluationRubricItem] = Field(min_length=1)
    common_mistakes: list[str] = Field(min_length=2)
    oral_answer_outline: list[str] = Field(min_length=2)
    reference_answer: str = Field(min_length=40, max_length=1200)
    follow_up_questions: list[str] = Field(default_factory=list)
    sources: list[InterviewSourceReference] = Field(min_length=1)
    review_status: ReviewStatus = "pending"
    verified_by_human: bool = False
    quality_score: float | None = Field(default=None, ge=0, le=100)

    @field_validator("topic", "subtopic", "question_type")
    @classmethod
    def normalize_key(cls, value: str) -> str:
        return "_".join(value.strip().lower().replace("-", " ").split())

    @field_validator(
        "question",
        "reference_answer",
        "tags",
        "reference_points",
        "common_mistakes",
        "oral_answer_outline",
        "follow_up_questions",
    )
    @classmethod
    def normalize_content(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise ValueError("文本字段不能为空")
            return normalized
        if isinstance(value, list):
            normalized: list[str] = []
            for item in value:
                text = str(item).strip()
                if text and text not in normalized:
                    normalized.append(text)
            return normalized
        return value

    @field_validator("evaluation_rubric")
    @classmethod
    def validate_rubric_weight(cls, value: list[EvaluationRubricItem]) -> list[EvaluationRubricItem]:
        if sum(item.weight for item in value) != 100:
            raise ValueError("evaluation_rubric 的 weight 总和必须为 100")
        return value

    def model_post_init(self, __context: Any) -> None:
        if self.difficulty in {"medium", "hard"} and not self.follow_up_questions:
            raise ValueError("medium 和 hard 题必须提供 follow_up_questions")
        if self.review_status == "verified" and not self.verified_by_human:
            raise ValueError("verified 题目必须由人工确认")
        if self.review_status != "verified" and self.verified_by_human:
            raise ValueError("只有 verified 题目可以标记 verified_by_human")


class InterviewQuestionCatalog(BaseModel):
    catalog_version: int = 1
    questions: list[InterviewQuestionSeed] = Field(default_factory=list)


class AlgorithmProblemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stable_key: str
    platform: str
    external_id: str
    title: str
    title_zh: str | None
    slug: str
    url: str
    difficulty: Difficulty
    pattern_key: str
    topics: list[str]
    source_lists: list[str]
    source_name: str
    source_license: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class InterviewQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain: QuestionDomain
    topic: str
    subtopic: str
    question: str
    difficulty: Difficulty
    question_type: str
    expected_duration_seconds: int
    tags: list[str]
    reference_points: list[str]
    evaluation_rubric: list[EvaluationRubricItem]
    common_mistakes: list[str]
    oral_answer_outline: list[str]
    reference_answer: str
    follow_up_questions: list[str]
    sources: list[InterviewQuestionSource]
    review_status: ReviewStatus
    verified_by_human: bool
    quality_score: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AnswerEvaluation(BaseModel):
    correctness_score: int = Field(ge=0, le=100)
    completeness_score: int = Field(ge=0, le=100)
    structure_score: int = Field(ge=0, le=100)
    oral_clarity_score: int = Field(ge=0, le=100)
    matched_points: list[str] = Field(default_factory=list)
    incorrect_points: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    improved_answer: str = ""
    follow_up_questions: list[str] = Field(default_factory=list)
