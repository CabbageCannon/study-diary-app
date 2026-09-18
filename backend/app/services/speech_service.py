import re
from time import perf_counter
from urllib.parse import urlsplit

import httpx

from app.config import settings


class SpeechTranscriptionError(RuntimeError):
    pass


TECHNICAL_TERMS = (
    "Agent",
    "RAG",
    "LangChain",
    "LangGraph",
    "MCP",
    "Embedding",
    "Transformer",
    "Prompt",
    "Token",
    "Redis",
    "MySQL",
    "TCP",
    "HTTP",
    "HTTPS",
    "WebSocket",
    "SSE",
    "FastAPI",
)
_TERM_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9])({'|'.join(sorted(map(re.escape, TECHNICAL_TERMS), key=len, reverse=True))})(?![A-Za-z0-9])",
    re.IGNORECASE,
)
_TERM_CASE = {term.casefold(): term for term in TECHNICAL_TERMS}
_SENSEVOICE_TAG = re.compile(r"<\|[^|]+\|>")


def normalize_transcript(text: str) -> str:
    cleaned = _SENSEVOICE_TAG.sub("", text).strip()
    return _TERM_PATTERN.sub(lambda match: _TERM_CASE[match.group(0).casefold()], cleaned)


async def transcribe_audio(*, filename: str, content: bytes, content_type: str, context: str) -> dict[str, object]:
    if not settings.asr_base_url:
        raise SpeechTranscriptionError("语音转写服务尚未配置。")

    data = {
        "model": settings.asr_model,
        "response_format": "json",
        "prompt": "，".join(TECHNICAL_TERMS) + (f"。当前题目：{context[:500]}" if context else ""),
    }
    headers = {"Authorization": f"Bearer {settings.asr_api_key}"} if settings.asr_api_key else {}
    started_at = perf_counter()
    is_local_service = urlsplit(settings.asr_base_url).hostname in {"127.0.0.1", "localhost", "::1"}
    try:
        async with httpx.AsyncClient(timeout=120, trust_env=not is_local_service) as client:
            response = await client.post(
                f"{settings.asr_base_url}/v1/audio/transcriptions",
                data=data,
                files={"file": (filename, content, content_type)},
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise SpeechTranscriptionError(f"语音服务返回 {exc.response.status_code}。") from exc
    except httpx.HTTPError as exc:
        raise SpeechTranscriptionError("暂时无法连接语音转写服务。") from exc

    try:
        payload = response.json()
        raw_text = payload["text"] if isinstance(payload, dict) else payload
        if not isinstance(raw_text, str):
            raise TypeError
    except (ValueError, KeyError, TypeError) as exc:
        raise SpeechTranscriptionError("语音服务返回了无法识别的结果。") from exc

    return {
        "text": normalize_transcript(raw_text),
        "model": settings.asr_model,
        "processing_ms": round((perf_counter() - started_at) * 1000),
    }
