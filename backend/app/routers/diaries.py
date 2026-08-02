from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.llm import LLMError, generate_learning_diary_draft, rewrite_learning_diary_draft
from app.schemas import DiaryDraft, DiaryDraftCreate, DiaryDraftRewrite, DiaryRead, DiarySave


router = APIRouter(prefix="/api/diaries", tags=["diaries"])


@router.post("/draft", response_model=DiaryDraft)
async def create_draft(payload: DiaryDraftCreate) -> DiaryDraft:
    try:
        draft = await generate_learning_diary_draft(date=payload.date, raw_text=payload.raw_text)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return DiaryDraft(date=payload.date, raw_text=payload.raw_text, **draft.model_dump())


@router.post("/draft/rewrite", response_model=DiaryDraft)
async def rewrite_draft(payload: DiaryDraftRewrite) -> DiaryDraft:
    try:
        draft = await rewrite_learning_diary_draft(
            date=payload.date,
            raw_text=payload.raw_text,
            current_draft=payload.current_draft,
            feedback=payload.feedback,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return DiaryDraft(date=payload.date, raw_text=payload.raw_text, **draft.model_dump())


@router.post("", response_model=DiaryRead, status_code=status.HTTP_201_CREATED)
def create_diary(payload: DiarySave, db: Session = Depends(get_db)) -> DiaryRead:
    return crud.create_diary(db=db, payload=payload)


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
