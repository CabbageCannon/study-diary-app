from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.llm import LLMError, polish_learning_diary
from app.schemas import DiaryCreate, DiaryRead


router = APIRouter(prefix="/api/diaries", tags=["diaries"])


@router.post("", response_model=DiaryRead, status_code=status.HTTP_201_CREATED)
async def create_diary(payload: DiaryCreate, db: Session = Depends(get_db)) -> DiaryRead:
    try:
        polished = await polish_learning_diary(date=payload.date, raw_text=payload.raw_text)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return crud.create_diary(db=db, payload=payload, polished=polished)


@router.get("", response_model=list[DiaryRead])
def list_diaries(db: Session = Depends(get_db)) -> list[DiaryRead]:
    return crud.list_diaries(db)


@router.get("/{diary_id}", response_model=DiaryRead)
def get_diary(diary_id: int, db: Session = Depends(get_db)) -> DiaryRead:
    diary = crud.get_diary(db=db, diary_id=diary_id)
    if diary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学习日记不存在")

    return diary


@router.delete("/{diary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_diary(diary_id: int, db: Session = Depends(get_db)) -> None:
    diary = crud.get_diary(db=db, diary_id=diary_id)
    if diary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学习日记不存在")

    crud.delete_diary(db=db, diary=diary)
