import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Diary
from app.schemas import DiaryCreate, PolishedDiary


def create_diary(db: Session, payload: DiaryCreate, polished: PolishedDiary) -> Diary:
    diary = Diary(
        date=payload.date,
        title=polished.title,
        raw_text=payload.raw_text,
        polished_text=polished.polished_text,
        summary=polished.summary,
        tags_json=json.dumps(polished.tags, ensure_ascii=False),
    )
    db.add(diary)
    db.commit()
    db.refresh(diary)
    return diary


def list_diaries(db: Session) -> list[Diary]:
    statement = select(Diary).order_by(Diary.created_at.desc())
    return list(db.scalars(statement).all())


def get_diary(db: Session, diary_id: int) -> Diary | None:
    return db.get(Diary, diary_id)


def delete_diary(db: Session, diary: Diary) -> None:
    db.delete(diary)
    db.commit()
