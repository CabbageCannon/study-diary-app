from datetime import date as date_type
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

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
ReviewMethod = Literal["human", "ai_auto", "manual_override"]
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


class InterviewQuestionAIReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quality_score: int = Field(ge=0, le=100)
    clarity_score: int = Field(ge=0, le=100)
    technical_score: int = Field(ge=0, le=100)
    interview_value_score: int = Field(ge=0, le=100)
    source_support_score: int = Field(ge=0, le=100)
    factual_risk: bool
    duplicate_risk: bool
    issues: list[str] = Field(default_factory=list, max_length=8)
    suggested_changes: list[str] = Field(default_factory=list, max_length=8)
    recommended_status: Literal["pending", "verified"] = "pending"

    @field_validator("issues", "suggested_changes")
    @classmethod
    def normalize_review_lists(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item.strip()]


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
    human_quality_score: float | None = Field(default=None, ge=0, le=100)
    ai_quality_score: float | None = Field(default=None, ge=0, le=100)
    review_method: ReviewMethod | None = None
    review_model: str | None = Field(default=None, max_length=160)
    ai_review_json: InterviewQuestionAIReview | None = None
    reviewed_at: datetime | None = None
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
        if self.human_quality_score is None and self.quality_score is not None:
            self.human_quality_score = self.quality_score
        if self.quality_score is None and self.human_quality_score is not None:
            self.quality_score = self.human_quality_score
        if self.difficulty in {"medium", "hard"} and not self.follow_up_questions:
            raise ValueError("medium 和 hard 题必须提供 follow_up_questions")
        if self.review_status == "verified" and not self.verified_by_human and self.review_method not in {"ai_auto", "manual_override"}:
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
    is_completed: bool = False
    needs_review: bool = False
    attempt_count: int = 0


AlgorithmTrainingMode = Literal[
    "daily", "hot100", "topic", "difficulty", "random", "weakness", "wrong", "similar", "custom", "review"
]
AlgorithmSessionStatus = Literal["in_progress", "completed", "abandoned"]
AlgorithmSessionItemStatus = Literal["pending", "in_progress", "solved", "needs_review", "skipped"]
AlgorithmAttemptResult = Literal["solved", "partially_solved", "failed", "gave_up"]
AlgorithmReasoningConclusion = Literal["correct", "partially_correct", "critical_error", "insufficient_context"]
AlgorithmReasoningSaveStatus = Literal["saved", "save_failed"]
AlgorithmReasoningCheckStatus = Literal["not_attempted", "completed", "failed", "context_unavailable"]
AlgorithmReasoningIssueType = Literal["key_error", "missing", "unclear"]
AlgorithmReasoningCounterexampleKind = Literal["counterexample", "followup", "none"]
AlgorithmComplexityVerdict = Literal["correct", "incorrect", "partially_correct", "not_stated"]


class AlgorithmPracticeSessionCreate(BaseModel):
    mode: AlgorithmTrainingMode
    count: int = Field(default=5, ge=1, le=20)
    topics: list[str] = Field(default_factory=list, max_length=8)
    difficulty: list[Difficulty] = Field(default_factory=list, max_length=3)
    source_lists: list[str] = Field(default_factory=list, max_length=5)
    problem_ids: list[str] = Field(default_factory=list, max_length=20)
    exclude_solved: bool = False
    prioritize_due_review: bool = True
    reference_problem_id: str | None = Field(default=None, max_length=160)

    @field_validator("topics", "source_lists", "problem_ids")
    @classmethod
    def normalize_filter_values(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            item = str(value).strip()
            if item and item not in normalized:
                normalized.append(item)
        return normalized


class AlgorithmPracticeSessionProgressUpdate(BaseModel):
    current_index: int = Field(ge=0)
    item_status: AlgorithmSessionItemStatus | None = None


class AlgorithmAttemptCreate(BaseModel):
    problem_id: int
    session_id: str | None = Field(default=None, max_length=36)
    duration_seconds: int | None = Field(default=None, ge=0, le=86_400)
    result: AlgorithmAttemptResult
    language: str | None = Field(default=None, max_length=48)
    approach: str = Field(default="", max_length=12_000)
    time_complexity: str | None = Field(default=None, max_length=160)
    space_complexity: str | None = Field(default=None, max_length=160)
    code: str | None = Field(default=None, max_length=40_000)
    reflection: str | None = Field(default=None, max_length=12_000)
    mistakes: str | None = Field(default=None, max_length=8_000)
    edge_cases: str | None = Field(default=None, max_length=8_000)
    needs_review: bool = False

    @field_validator("language", "time_complexity", "space_complexity", "approach", "code", "reflection", "mistakes", "edge_cases")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()


class AlgorithmReasoningInputOutput(BaseModel):
    input: str = Field(min_length=1, max_length=500)
    output: str = Field(min_length=1, max_length=500)


class AlgorithmReasoningExample(BaseModel):
    input: str = Field(min_length=1, max_length=500)
    output: str = Field(min_length=1, max_length=500)
    explanation: str | None = Field(default=None, max_length=800)


class AlgorithmReasoningVerificationPoint(BaseModel):
    id: str = Field(min_length=4, max_length=80, pattern=r"^vp-[a-z0-9][a-z0-9-]*$")
    kind: Literal["key_insight", "correctness_condition", "complexity", "edge_case"]
    statement: str = Field(min_length=1, max_length=500)
    required: bool
    acceptable_variants: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("acceptable_variants")
    @classmethod
    def normalize_variants(cls, values: list[str]) -> list[str]:
        return [item.strip() for item in values if item.strip()]


class AlgorithmReasoningAcceptableApproach(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    idea: str = Field(min_length=1, max_length=800)
    time_complexity: str = Field(min_length=1, max_length=80)
    space_complexity: str = Field(min_length=1, max_length=80)
    is_reference: bool = False
    note: str | None = Field(default=None, max_length=500)


class AlgorithmReasoningCommonMistake(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    counterexample: str | None = Field(default=None, max_length=500)


class AlgorithmReasoningEdgeCase(BaseModel):
    description: str = Field(min_length=1, max_length=400)
    expected_handling: str = Field(min_length=1, max_length=500)


class AlgorithmReasoningSource(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    url: str = Field(min_length=1, max_length=600)
    license_note: str = Field(min_length=1, max_length=240)
    source_version: str = Field(min_length=1, max_length=240)


class AlgorithmProblemContextSeed(BaseModel):
    schema_version: Literal[1]
    problem_key: str = Field(min_length=1, max_length=160)
    title: str | None = Field(default=None, max_length=320)
    title_zh: str = Field(min_length=1, max_length=320)
    statement_zh: str = Field(min_length=20, max_length=2000)
    input_output: AlgorithmReasoningInputOutput
    constraints: list[str] = Field(min_length=1, max_length=20)
    examples: list[AlgorithmReasoningExample] = Field(min_length=1, max_length=8)
    verification_points: list[AlgorithmReasoningVerificationPoint] = Field(min_length=1, max_length=20)
    acceptable_approaches: list[AlgorithmReasoningAcceptableApproach] = Field(min_length=1, max_length=12)
    common_mistakes: list[AlgorithmReasoningCommonMistake] = Field(default_factory=list, max_length=12)
    edge_cases: list[AlgorithmReasoningEdgeCase] = Field(default_factory=list, max_length=12)
    source: AlgorithmReasoningSource
    content_notes: str | None = Field(default=None, max_length=1000)
    content_status: Literal["draft", "ready"]

    @field_validator("problem_key", "title", "title_zh", "statement_zh", "constraints", "content_notes")
    @classmethod
    def normalize_context_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise ValueError("文本字段不能为空")
        if isinstance(value, list):
            value = [str(item).strip() for item in value if str(item).strip()]
        return value

    @field_validator("verification_points")
    @classmethod
    def validate_unique_verification_point_ids(
        cls, values: list[AlgorithmReasoningVerificationPoint]
    ) -> list[AlgorithmReasoningVerificationPoint]:
        ids = [item.id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("verification_points.id 必须在文件内唯一")
        return values

    @field_validator("acceptable_approaches")
    @classmethod
    def validate_single_reference(
        cls, values: list[AlgorithmReasoningAcceptableApproach]
    ) -> list[AlgorithmReasoningAcceptableApproach]:
        if sum(item.is_reference for item in values) != 1:
            raise ValueError("acceptable_approaches 必须恰好包含一个 is_reference=true")
        return values


class AlgorithmProblemContextRead(AlgorithmProblemContextSeed):
    content_version: int
    content_hash: str
    content_updated_at: datetime


class AlgorithmProblemReasoningContextResponse(BaseModel):
    problem_id: str
    reasoning_available: bool
    context: AlgorithmProblemContextRead | None = None


class AlgorithmReasoningAnswerDetails(BaseModel):
    time_complexity: str | None = Field(default=None, max_length=160)
    space_complexity: str | None = Field(default=None, max_length=160)
    code: str | None = Field(default=None, max_length=40_000)
    notes: str | None = Field(default=None, max_length=8_000)

    @field_validator("time_complexity", "space_complexity", "code", "notes")
    @classmethod
    def trim_optional_detail(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AlgorithmReasoningAnswerCreate(BaseModel):
    problem_id: str = Field(min_length=1, max_length=160)
    session_id: str | None = Field(default=None, max_length=36)
    revision_of_answer_id: int | None = Field(default=None, ge=1)
    answer_text: str = Field(min_length=1, max_length=12_000)
    answer_source: Literal["voice", "text"] = "text"
    details: AlgorithmReasoningAnswerDetails = Field(default_factory=AlgorithmReasoningAnswerDetails)
    client_answer_id: str
    duration_seconds: int | None = Field(default=None, ge=0, le=86_400)

    @field_validator("answer_text")
    @classmethod
    def normalize_answer_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("answer_text 不能为空")
        return value

    @field_validator("client_answer_id")
    @classmethod
    def validate_client_answer_id(cls, value: str) -> str:
        return str(UUID(value.strip()))


class AlgorithmReasoningCheckCreate(AlgorithmReasoningAnswerCreate):
    pass


class AlgorithmReasoningRecheckRequest(BaseModel):
    refresh: bool = False


class AlgorithmReasoningAnswerRead(BaseModel):
    answer_id: int
    problem_id: str
    session_id: str | None
    version: int
    revision_of_answer_id: int | None
    answer_text: str
    answer_source: Literal["voice", "text"]
    details: AlgorithmReasoningAnswerDetails
    client_answer_id: str
    save_status: Literal["saved"] = "saved"
    check_status: AlgorithmReasoningCheckStatus
    saved_at: datetime
    checked_at: datetime | None


class AlgorithmReasoningQuotedPoint(BaseModel):
    point: str = Field(min_length=1, max_length=600)
    quote: str | None = Field(default=None, max_length=500)


class AlgorithmReasoningIssue(BaseModel):
    type: AlgorithmReasoningIssueType
    detail: str = Field(min_length=1, max_length=800)
    quote: str | None = Field(default=None, max_length=500)
    verification_point_id: str | None = Field(default=None, max_length=80)


class AlgorithmReasoningCounterexample(BaseModel):
    kind: AlgorithmReasoningCounterexampleKind
    content: str | None = Field(default=None, max_length=1000)


class AlgorithmReasoningComplexityItem(BaseModel):
    user_claim: str | None = Field(default=None, max_length=160)
    assessment: AlgorithmComplexityVerdict
    expected: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=500)


class AlgorithmReasoningComplexity(BaseModel):
    time: AlgorithmReasoningComplexityItem
    space: AlgorithmReasoningComplexityItem


class AlgorithmReasoningFeedbackModel(BaseModel):
    conclusion: AlgorithmReasoningConclusion
    context_sufficient: bool
    headline: str = Field(min_length=1, max_length=120)
    correct_parts: list[AlgorithmReasoningQuotedPoint] = Field(default_factory=list, max_length=12)
    issues_or_missing: list[AlgorithmReasoningIssue] = Field(default_factory=list, max_length=12)
    counterexample_or_followup: AlgorithmReasoningCounterexample
    complexity: AlgorithmReasoningComplexity
    alternative_approaches_accepted: list[str] = Field(default_factory=list, max_length=8)
    reference_outline: str = Field(default="", max_length=2000)
    needs_review: bool = True
    followup_for_supplement: str | None = Field(default=None, max_length=500)

    def model_post_init(self, __context: Any) -> None:
        if self.conclusion == "insufficient_context" and self.context_sufficient:
            raise ValueError("insufficient_context 必须设置 context_sufficient=false")
        if self.conclusion != "insufficient_context" and not self.context_sufficient:
            raise ValueError("context_sufficient=false 只能用于 insufficient_context")
        if self.conclusion == "critical_error" and not any(item.type == "key_error" for item in self.issues_or_missing):
            raise ValueError("critical_error 至少需要一条 key_error")
        if self.conclusion == "insufficient_context" and not any(item.type == "unclear" for item in self.issues_or_missing):
            raise ValueError("insufficient_context 至少需要一条 unclear")
        if self.conclusion in {"partially_correct", "insufficient_context"} and not self.followup_for_supplement:
            raise ValueError("待补充或信息不足时必须提供 followup_for_supplement")
        if self.counterexample_or_followup.kind != "none" and not self.counterexample_or_followup.content:
            raise ValueError("反例或追问内容不能为空")
        if self.counterexample_or_followup.kind == "none" and self.counterexample_or_followup.content:
            raise ValueError("kind=none 时 content 必须为空")


class AlgorithmReasoningFeedbackRead(AlgorithmReasoningFeedbackModel):
    feedback_id: int
    answer_id: int
    model_name: str
    prompt_version: str
    context_version: int
    created_at: datetime


class AlgorithmReasoningRetry(BaseModel):
    check_url: str
    method: Literal["POST"] = "POST"


class AlgorithmReasoningProblemContextSummary(BaseModel):
    problem_id: str
    content_version: int | None = None
    reasoning_available: bool


class AlgorithmReasoningCheckResponse(BaseModel):
    save_status: AlgorithmReasoningSaveStatus
    check_status: AlgorithmReasoningCheckStatus
    answer: AlgorithmReasoningAnswerRead | None = None
    feedback: AlgorithmReasoningFeedbackRead | None = None
    save_error: str | None = None
    check_error: str | None = None
    retry: AlgorithmReasoningRetry | None = None
    problem_context: AlgorithmReasoningProblemContextSummary | None = None


class AlgorithmReasoningAnswerDetailRead(BaseModel):
    answer: AlgorithmReasoningAnswerRead
    feedback: AlgorithmReasoningFeedbackRead | None = None


class AlgorithmAttemptUpdate(BaseModel):
    approach: str | None = Field(default=None, max_length=12_000)
    time_complexity: str | None = Field(default=None, max_length=160)
    space_complexity: str | None = Field(default=None, max_length=160)
    code: str | None = Field(default=None, max_length=40_000)
    reflection: str | None = Field(default=None, max_length=12_000)
    mistakes: str | None = Field(default=None, max_length=8_000)
    edge_cases: str | None = Field(default=None, max_length=8_000)
    needs_review: bool | None = None


class AlgorithmComplexityAssessment(BaseModel):
    user_claim: str = ""
    suggested: str = ""
    is_likely_correct: bool = False
    reason: str = ""


class AlgorithmCodeReview(BaseModel):
    has_code: bool = False
    possible_bugs: list[str] = Field(default_factory=list, max_length=8)
    readability_suggestions: list[str] = Field(default_factory=list, max_length=8)


class AlgorithmAIReview(BaseModel):
    summary: str = Field(min_length=1, max_length=2_000)
    approach_assessment: str = Field(min_length=1, max_length=4_000)
    correct_parts: list[str] = Field(default_factory=list, max_length=12)
    issues: list[str] = Field(default_factory=list, max_length=12)
    missing_edge_cases: list[str] = Field(default_factory=list, max_length=12)
    time_complexity_assessment: AlgorithmComplexityAssessment
    space_complexity_assessment: AlgorithmComplexityAssessment
    code_review: AlgorithmCodeReview
    better_approach: str = Field(default="", max_length=4_000)
    reflection_prompt: str = Field(default="", max_length=1_000)
    needs_review: bool = True
    weak_topics: list[str] = Field(default_factory=list, max_length=8)
    recommended_problem_ids: list[int] = Field(default_factory=list, max_length=5)


class AlgorithmHintRequest(BaseModel):
    hint_level: int = Field(ge=1, le=4)
    approach: str = Field(default="", max_length=8_000)


class AlgorithmHintRead(BaseModel):
    hint_level: int
    content: str
    remaining_hint_levels: int


class AlgorithmHintContent(BaseModel):
    content: str = Field(min_length=1, max_length=2_000)


class AlgorithmAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    problem_id: int
    session_id: str | None
    session_item_id: int | None
    started_at: datetime
    submitted_at: datetime | None
    duration_seconds: int | None
    result: AlgorithmAttemptResult
    language: str | None
    approach: str
    time_complexity: str | None
    space_complexity: str | None
    code: str | None
    reflection: str | None
    mistakes: str | None
    edge_cases: str | None
    hint_count: int
    needs_review: bool
    ai_feedback: dict[str, object] | None
    ai_feedback_status: str
    created_at: datetime
    updated_at: datetime


class AlgorithmPracticeSessionItemRead(BaseModel):
    id: int
    problem_id: int
    position: int
    status: AlgorithmSessionItemStatus
    started_at: datetime | None
    completed_at: datetime | None
    skipped_at: datetime | None
    problem: AlgorithmProblemRead
    latest_attempt: AlgorithmAttemptRead | None = None
    attempt_count: int = 0


class AlgorithmPracticeSessionRead(BaseModel):
    id: str
    mode: AlgorithmTrainingMode
    status: AlgorithmSessionStatus
    requested_count: int
    question_count: int
    current_index: int
    filters: dict[str, object]
    started_at: datetime
    last_active_at: datetime
    completed_at: datetime | None
    abandoned_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[AlgorithmPracticeSessionItemRead]
    available_problem_count: int = 0
    availability_message: str | None = None


class AlgorithmPracticeSessionSummary(BaseModel):
    id: str
    mode: AlgorithmTrainingMode
    status: AlgorithmSessionStatus
    question_count: int
    solved_count: int
    needs_review_count: int
    current_index: int
    started_at: datetime
    last_active_at: datetime
    completed_at: datetime | None


class AlgorithmReviewScheduleRead(BaseModel):
    problem: AlgorithmProblemRead
    next_review_at: datetime
    interval_days: int
    review_count: int
    mastery_level: int
    reason: str
    last_attempt: AlgorithmAttemptRead | None = None


class AlgorithmStatsRead(BaseModel):
    current_streak_days: int
    today_completed_count: int
    total_attempt_count: int
    unique_solved_count: int
    completed_by_difficulty: dict[str, int]
    completed_by_topic: dict[str, int]
    success_rate_by_topic: dict[str, float]
    average_duration_seconds: int | None
    due_review_count: int
    wrong_problem_count: int
    in_progress_session_count: int
    recent_7_days: list[dict[str, int | str]]
    recent_30_days: list[dict[str, int | str]]


class AlgorithmWeaknessRead(BaseModel):
    topic: str
    attempt_count: int
    success_rate: float
    average_duration_seconds: int | None
    needs_review_count: int
    due_review_count: int
    mastery_score: int
    updated_at: datetime


AlgorithmDailyRecommendationStrategy = Literal[
    "balanced", "random", "topic", "difficulty", "source_list", "weakness", "wrong", "review_first"
]


class AlgorithmDailyRecommendationSettingsUpdate(BaseModel):
    strategy: AlgorithmDailyRecommendationStrategy = "balanced"
    topics: list[str] = Field(default_factory=list, max_length=8)
    difficulties: list[Difficulty] = Field(default_factory=list, max_length=3)
    source_lists: list[str] = Field(default_factory=list, max_length=5)
    exclude_solved: bool = False
    prioritize_due_review: bool = True
    avoid_recent_days: int = Field(default=14, ge=0, le=90)
    extra_recommendation_count: int = Field(default=6)
    include_adjacent_difficulty: bool = False
    include_review_items: bool = True

    @field_validator("topics", "source_lists")
    @classmethod
    def normalize_daily_filter_values(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            item = str(value).strip()
            if item and item not in normalized:
                normalized.append(item)
        return normalized

    @field_validator("extra_recommendation_count")
    @classmethod
    def validate_extra_recommendation_count(cls, value: int) -> int:
        if value not in {4, 6, 8}:
            raise ValueError("额外推荐数量只能是 4、6 或 8。")
        return value


class AlgorithmDailyRecommendationSettingsRead(AlgorithmDailyRecommendationSettingsUpdate):
    id: int
    created_at: datetime
    updated_at: datetime


class AlgorithmDailyFeedRead(BaseModel):
    date: str
    primary_problem: AlgorithmProblemRead
    extra_problems: list[AlgorithmProblemRead]
    strategy: AlgorithmDailyRecommendationStrategy
    settings_summary: str
    refresh_version: int
    generated_at: datetime
    refreshed_at: datetime | None
    warning: str | None = None
    primary_problem_completed: bool = False
    primary_problem_needs_review: bool = False
    primary_problem_attempt_count: int = 0


class AlgorithmCatalogOverviewRead(BaseModel):
    total_problem_count: int
    active_problem_count: int
    completed_problem_count: int
    due_review_count: int
    difficulty_counts: dict[str, int]
    source_list_counts: dict[str, int]
    topic_counts: dict[str, int]


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
    human_quality_score: float | None
    ai_quality_score: float | None
    review_method: ReviewMethod | None
    review_model: str | None
    ai_review: InterviewQuestionAIReview | None
    reviewed_at: datetime | None
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
    improved_answer: str = Field(min_length=40, max_length=1200)
    follow_up_questions: list[str] = Field(default_factory=list)

    @field_validator("matched_points", "incorrect_points", "missing_points", "follow_up_questions")
    @classmethod
    def normalize_evaluation_lists(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item.strip()]


QuestionSetStatus = Literal["in_progress", "completed", "abandoned"]
QuestionSetItemStatus = Literal["pending", "answered", "skipped"]
AnswerSource = Literal["voice", "text"]


class InterviewQuestionReviewUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=8, max_length=1000)
    difficulty: Difficulty | None = None
    expected_duration_seconds: int | None = Field(default=None, ge=30, le=600)
    tags: list[str] | None = Field(default=None, min_length=1)
    reference_points: list[str] | None = Field(default=None, min_length=1)
    evaluation_rubric: list[EvaluationRubricItem] | None = Field(default=None, min_length=1)
    common_mistakes: list[str] | None = Field(default=None, min_length=1)
    oral_answer_outline: list[str] | None = Field(default=None, min_length=1)
    reference_answer: str | None = Field(default=None, min_length=40, max_length=1200)
    follow_up_questions: list[str] | None = None
    review_status: ReviewStatus | None = None
    human_quality_score: float | None = Field(default=None, ge=0, le=100)
    quality_score: float | None = Field(default=None, ge=0, le=100)

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
    def normalize_optional_content(cls, value: Any) -> Any:
        if value is None:
            return None
        return InterviewQuestionSeed.normalize_content(value)

    @field_validator("evaluation_rubric")
    @classmethod
    def validate_optional_rubric(cls, value: list[EvaluationRubricItem] | None) -> list[EvaluationRubricItem] | None:
        if value is not None and sum(item.weight for item in value) != 100:
            raise ValueError("evaluation_rubric 的 weight 总和必须为 100")
        return value


class InterviewQuestionAIReviewRequest(BaseModel):
    auto_publish: bool = False


class InterviewQuestionAIReviewResult(BaseModel):
    question: InterviewQuestionRead
    review: InterviewQuestionAIReview
    published: bool
    review_model: str


class InterviewQuestionIdsRequest(BaseModel):
    question_ids: list[str] = Field(min_length=1, max_length=30)

    @field_validator("question_ids")
    @classmethod
    def validate_question_ids(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value if item.strip()]
        if not normalized:
            raise ValueError("question_ids cannot be empty")
        if len(normalized) != len(set(normalized)):
            raise ValueError("question_ids must be unique")
        return normalized


class InterviewQuestionAIReviewBatchRequest(InterviewQuestionIdsRequest):
    auto_publish: bool = False


class InterviewQuestionBatchItemResult(BaseModel):
    question_id: str
    outcome: Literal["reviewed", "published", "kept_pending", "skipped", "failed"]
    message: str | None = None
    review: InterviewQuestionAIReview | None = None


class InterviewQuestionBatchResult(BaseModel):
    total: int
    reviewed: int
    published: int
    kept_pending: int
    failed: int
    skipped: int
    items: list[InterviewQuestionBatchItemResult]


BatchJobType = Literal["ai_review", "quick_publish", "reject"]
BatchJobStatus = Literal["queued", "running", "completed", "partial_failed", "failed"]
BatchJobItemStatus = Literal["pending", "running", "succeeded", "skipped", "failed"]


class InterviewBatchJobCreate(InterviewQuestionIdsRequest):
    type: BatchJobType
    auto_publish: bool = False


class InterviewBatchJobItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: str
    status: BatchJobItemStatus
    outcome: str | None
    message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class InterviewBatchJobRead(BaseModel):
    id: str
    type: BatchJobType
    status: BatchJobStatus
    auto_publish: bool
    total: int
    processed_count: int
    succeeded_count: int
    skipped_count: int
    failed_count: int
    published_count: int
    kept_pending_count: int
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime
    items: list[InterviewBatchJobItemRead]


class InterviewQuestionForTraining(BaseModel):
    id: str
    domain: QuestionDomain
    topic: str
    difficulty: Difficulty
    expected_duration_seconds: int
    tags: list[str]
    question: str


class InterviewQuestionSetCreate(BaseModel):
    domain: QuestionDomain | None = None
    topic: str | None = Field(default=None, max_length=100)
    difficulty: Difficulty | None = None
    question_count: int = Field(ge=1, le=30)
    include_due_reviews: bool = True
    random_order: bool = True

    @field_validator("topic")
    @classmethod
    def normalize_optional_topic(cls, value: str | None) -> str | None:
        return InterviewQuestionSeed.normalize_key(value) if value else None


class InterviewEvaluationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    answer_id: int
    correctness_score: int
    completeness_score: int
    structure_score: int
    oral_clarity_score: int
    total_score: float
    matched_points: list[str]
    incorrect_points: list[str]
    missing_points: list[str]
    improved_answer: str
    follow_up_questions: list[str]
    model_name: str
    created_at: datetime


class InterviewAnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_set_id: int
    question_id: str
    attempt_index: int
    answer_text: str
    answer_source: AnswerSource
    duration_seconds: int | None
    created_at: datetime
    updated_at: datetime


class InterviewAnswerCreate(BaseModel):
    question_id: str = Field(min_length=1, max_length=160)
    answer_text: str = Field(min_length=1, max_length=12000)
    answer_source: AnswerSource
    duration_seconds: int | None = Field(default=None, ge=0, le=7200)

    @field_validator("answer_text")
    @classmethod
    def normalize_answer_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("answer_text 不能为空")
        return value


class InterviewAnswerSubmissionRead(BaseModel):
    answer: InterviewAnswerRead
    evaluation: InterviewEvaluationRead | None = None
    evaluation_status: Literal["completed", "failed"]
    evaluation_error: str | None = None
    next_review_at: datetime | None = None


class InterviewQuestionSetItemRead(BaseModel):
    id: int
    order_index: int
    status: QuestionSetItemStatus
    question: InterviewQuestionForTraining
    latest_answer: InterviewAnswerRead | None = None
    latest_evaluation: InterviewEvaluationRead | None = None
    next_review_at: datetime | None = None


class InterviewQuestionSetProgressUpdate(BaseModel):
    current_index: int = Field(ge=0)
    last_active_question_id: str | None = Field(default=None, min_length=1, max_length=160)


class InterviewQuestionSetRead(BaseModel):
    id: int
    date: str
    domain: QuestionDomain | None
    topic: str | None
    difficulty: Difficulty | None
    question_count: int
    available_question_count: int
    availability_message: str | None = None
    status: QuestionSetStatus
    current_index: int
    last_active_question_id: str | None
    include_due_reviews: bool
    random_order: bool
    created_at: datetime
    started_at: datetime
    last_active_at: datetime
    completed_at: datetime | None
    abandoned_at: datetime | None
    updated_at: datetime
    items: list[InterviewQuestionSetItemRead]
    current_question: InterviewQuestionForTraining | None


class InterviewQuestionSetSummary(BaseModel):
    id: int
    date: str
    domain: QuestionDomain | None
    topic: str | None
    difficulty: Difficulty | None
    question_count: int
    answered_count: int
    skipped_count: int
    status: QuestionSetStatus
    average_score: float | None
    created_at: datetime
    last_active_at: datetime
    completed_at: datetime | None
    abandoned_at: datetime | None


class InterviewTrainingDomainStat(BaseModel):
    domain: QuestionDomain
    answered_count: int
    average_score: float | None


class InterviewTrainingStats(BaseModel):
    streak_days: int
    today_answered_count: int
    total_answered_count: int
    due_review_count: int
    recent_average_score: float | None
    in_progress_count: int
    last_training_at: datetime | None
    domains: list[InterviewTrainingDomainStat]


class InterviewReviewScheduleRead(BaseModel):
    id: int
    question_id: str
    last_answer_id: int
    last_score: float
    next_review_at: datetime
    review_interval_days: int
    review_count: int
    question: InterviewQuestionForTraining


StudyActivityType = Literal["algorithm", "interview", "diary", "reading", "course", "custom"]
StudySessionStatus = Literal["running", "paused", "completed", "abandoned"]


class StudySessionCreate(BaseModel):
    client_event_id: str = Field(min_length=8, max_length=100)
    source: Literal["desktop_pet"] = "desktop_pet"
    activity_type: StudyActivityType = "custom"
    title: str = Field(default="自主学习", min_length=1, max_length=160)
    started_at: datetime | None = None

    @field_validator("client_event_id", "title")
    @classmethod
    def normalize_study_session_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("不能为空")
        return value


class StudySessionAction(BaseModel):
    accumulated_seconds: int = Field(ge=0, le=86_400)
    occurred_at: datetime | None = None


class StudySessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_event_id: str
    source: str
    activity_type: StudyActivityType
    title: str
    status: StudySessionStatus
    started_at: datetime
    last_resumed_at: datetime | None
    paused_at: datetime | None
    completed_at: datetime | None
    accumulated_seconds: int
    created_at: datetime
    updated_at: datetime


class DesktopPetSettingsUpdate(BaseModel):
    weather_enabled: bool | None = None
    location_label: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    weather_refresh_minutes: int | None = Field(default=None, ge=5, le=120)
    milestone_minutes: list[int] | None = Field(default=None, max_length=20)
    milestone_display_seconds: int | None = Field(default=None, ge=3, le=60)
    show_notifications: bool | None = None
    open_page_on_study_start: bool | None = None

    @field_validator("location_label")
    @classmethod
    def normalize_location_label(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("milestone_minutes")
    @classmethod
    def normalize_milestones(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        normalized = sorted({int(item) for item in value})
        if not normalized or any(item <= 0 or item > 1_440 for item in normalized):
            raise ValueError("里程碑必须是 1 到 1440 的正整数分钟")
        if len(normalized) > 20:
            raise ValueError("里程碑最多 20 个")
        return normalized


class DesktopPetSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weather_enabled: bool
    location_label: str
    latitude: float | None
    longitude: float | None
    weather_refresh_minutes: int
    milestone_minutes: list[int]
    milestone_display_seconds: int
    show_notifications: bool
    open_page_on_study_start: bool
    updated_at: datetime


class DesktopPetWeatherRead(BaseModel):
    location: str
    condition: str
    is_raining: bool
    temperature_c: float | None
    observed_at: datetime | None
    provider: str
    stale: bool


class TodayStudyTopic(BaseModel):
    title: str
    activity_type: StudyActivityType
    study_seconds: int


class DesktopPetDashboardRead(BaseModel):
    today_study_seconds: int
    total_study_seconds: int
    today_session_count: int
    today_topic_count: int
    today_topics: list[TodayStudyTopic]
    active_session: StudySessionRead | None
    due_interview_reviews: int
    due_algorithm_reviews: int
    recent_study_sessions: list[StudySessionRead]
    generated_at: datetime


class DesktopPetControlState(BaseModel):
    show_request_version: int
    show_acknowledged_version: int
    show_requested_at: datetime | None
    desktop_last_seen_at: datetime | None
    show_request_pending: bool


class ShowDesktopPetResponse(DesktopPetControlState):
    pass


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4096)
    p256dh: str = Field(min_length=1, max_length=1024)
    auth: str = Field(min_length=1, max_length=512)
    enabled: bool = True
    reminder_time: str = "21:30"
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=80)
    interview_goal: int = Field(default=3, ge=0, le=50)
    algorithm_goal: int = Field(default=3, ge=0, le=50)
    include_diary: bool = True
    include_review: bool = True

    @field_validator("reminder_time")
    @classmethod
    def validate_reminder_time(cls, value: str) -> str:
        try:
            hour, minute = (int(part) for part in value.split(":"))
        except (TypeError, ValueError) as exc:
            raise ValueError("reminder_time 必须使用 HH:MM") from exc
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("reminder_time 必须使用有效的 HH:MM")
        return f"{hour:02d}:{minute:02d}"


class PushSubscriptionUpdate(BaseModel):
    enabled: bool
    reminder_time: str
    timezone: str = Field(min_length=1, max_length=80)
    interview_goal: int = Field(ge=0, le=50)
    algorithm_goal: int = Field(ge=0, le=50)
    include_diary: bool
    include_review: bool

    @field_validator("reminder_time")
    @classmethod
    def validate_reminder_time(cls, value: str) -> str:
        return PushSubscriptionCreate.validate_reminder_time(value)


class PushSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    enabled: bool
    reminder_time: str
    timezone: str
    interview_goal: int
    algorithm_goal: int
    include_diary: bool
    include_review: bool


class PushPublicKeyRead(BaseModel):
    public_key: str


class ReminderDispatchRead(BaseModel):
    checked: int
    sent: int
    disabled: int
