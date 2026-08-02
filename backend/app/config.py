import os
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


def _normalize_sqlite_url(raw_url: str) -> str:
    if raw_url.startswith("sqlite:///./"):
        relative_path = raw_url.removeprefix("sqlite:///./")
        return f"sqlite:///{(BACKEND_DIR / relative_path).as_posix()}"

    return raw_url


def _read_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.llm_api_key = os.getenv("LLM_API_KEY", "").strip()
        self.llm_base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
        self.llm_model = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
        self.database_url = _normalize_sqlite_url(
            os.getenv("DATABASE_URL", "sqlite:///./data/study_diary.db").strip()
        )
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173").strip()
        self.allow_question_review = _read_bool("ALLOW_QUESTION_REVIEW")
        self.allow_unverified_question_access = _read_bool("ALLOW_UNVERIFIED_QUESTION_ACCESS")
        self.allow_ai_question_review = _read_bool("ALLOW_AI_QUESTION_REVIEW")
        self.allow_question_quick_publish = _read_bool("ALLOW_QUESTION_QUICK_PUBLISH")

    @property
    def frontend_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]


settings = Settings()
