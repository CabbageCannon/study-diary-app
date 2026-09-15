import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Diary
from app.schemas import DiarySave, DiaryUpdate


def create_diary(db: Session, payload: DiarySave) -> Diary:
    diary = Diary(
        date=payload.date,
        title=payload.title,
        raw_text=payload.raw_text,
        polished_text=payload.polished_text,
        summary=payload.summary,
        tags_json=json.dumps(payload.tags, ensure_ascii=False),
        category=payload.category,
        status=payload.status,
        images_json=json.dumps(payload.images, ensure_ascii=False),
        weather=payload.weather,
        location=payload.location,
        is_pinned=payload.is_pinned,
    )
    db.add(diary)
    db.commit()
    db.refresh(diary)
    return diary


def list_diaries(db: Session) -> list[Diary]:
    statement = select(Diary).order_by(Diary.is_pinned.desc(), Diary.updated_at.desc())
    return list(db.scalars(statement).all())


def get_diary(db: Session, diary_id: int) -> Diary | None:
    return db.get(Diary, diary_id)


def delete_diary(db: Session, diary: Diary) -> None:
    db.delete(diary)
    db.commit()


def update_diary(db: Session, diary: Diary, payload: DiaryUpdate) -> Diary:
    values = payload.model_dump(exclude_unset=True)
    if "tags" in values:
        diary.tags_json = json.dumps(values.pop("tags") or [], ensure_ascii=False)
    if "images" in values:
        diary.images_json = json.dumps(values.pop("images") or [], ensure_ascii=False)
    for name, value in values.items():
        setattr(diary, name, value)
    db.commit()
    db.refresh(diary)
    return diary
