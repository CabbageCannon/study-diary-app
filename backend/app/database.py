from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return

    database_path = Path(database_url.removeprefix("sqlite:///"))
    database_path.parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_parent(settings.database_url)

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_options = {"connect_args": connect_args, "pool_pre_ping": True}
if not settings.database_url.startswith("sqlite"):
    engine_options.update({"pool_size": 5, "max_overflow": 10, "pool_recycle": 1800})
engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


INTERVIEW_REVIEW_COLUMN_DEFINITIONS = {
    "human_quality_score": "FLOAT",
    "ai_quality_score": "FLOAT",
    "review_method": "VARCHAR(32)",
    "review_model": "VARCHAR(160)",
    "ai_review_json": "TEXT",
    "reviewed_at": "DATETIME",
}

INTERVIEW_QUESTION_SET_COLUMN_DEFINITIONS = {
    "last_active_question_id": "VARCHAR(160)",
    "include_due_reviews": "BOOLEAN NOT NULL DEFAULT 1",
    "random_order": "BOOLEAN NOT NULL DEFAULT 1",
    "started_at": "DATETIME",
    "last_active_at": "DATETIME",
    "abandoned_at": "DATETIME",
    "deleted_at": "DATETIME",
    "updated_at": "DATETIME",
}


def _apply_sqlite_review_metadata_migration() -> None:
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    if "interview_questions" not in inspector.get_table_names():
        return
    existing_columns = {column["name"] for column in inspector.get_columns("interview_questions")}
    missing_columns = {
        name: definition
        for name, definition in INTERVIEW_REVIEW_COLUMN_DEFINITIONS.items()
        if name not in existing_columns
    }
    if not missing_columns:
        return
    with engine.begin() as connection:
        for name, definition in missing_columns.items():
            connection.exec_driver_sql(f"ALTER TABLE interview_questions ADD COLUMN {name} {definition}")


def _apply_sqlite_interview_session_migration() -> None:
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    if "interview_question_sets" not in inspector.get_table_names():
        return
    existing_columns = {column["name"] for column in inspector.get_columns("interview_question_sets")}
    missing_columns = {
        name: definition
        for name, definition in INTERVIEW_QUESTION_SET_COLUMN_DEFINITIONS.items()
        if name not in existing_columns
    }
    with engine.begin() as connection:
        for name, definition in missing_columns.items():
            connection.exec_driver_sql(f"ALTER TABLE interview_question_sets ADD COLUMN {name} {definition}")
        connection.execute(
            text(
                "UPDATE interview_question_sets "
                "SET status = 'in_progress' "
                "WHERE status = 'active'"
            )
        )
        connection.execute(
            text(
                "UPDATE interview_question_sets "
                "SET started_at = COALESCE(started_at, created_at), "
                "last_active_at = COALESCE(last_active_at, created_at), "
                "updated_at = COALESCE(updated_at, created_at)"
            )
        )


def _mark_interrupted_batch_jobs_failed() -> None:
    inspector = inspect(engine)
    if "interview_batch_jobs" not in inspector.get_table_names():
        return
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE interview_batch_jobs "
                "SET status = 'failed', error = '服务重启前任务未完成，请重新提交', completed_at = CURRENT_TIMESTAMP "
                "WHERE status IN ('queued', 'running')"
            )
        )


def init_db() -> None:
    from app import models  # noqa: F401

    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
        _apply_sqlite_review_metadata_migration()
        _apply_sqlite_interview_session_migration()
    _mark_interrupted_batch_jobs_failed()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
