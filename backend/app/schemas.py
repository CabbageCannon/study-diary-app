from datetime import date as date_type
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
