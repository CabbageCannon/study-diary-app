import json

import httpx
from pydantic import ValidationError

from app.config import settings
from app.prompts import DRAFT_SYSTEM_PROMPT, REWRITE_SYSTEM_PROMPT, build_draft_user_prompt, build_rewrite_user_prompt
from app.schemas import DiaryDraftContent


class LLMError(RuntimeError):
    pass


def _parse_json_content(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMError("大模型返回的内容不是有效 JSON，请稍后重试。") from exc

    if not isinstance(parsed, dict):
        raise LLMError("大模型返回的 JSON 结构不正确。")

    return parsed


async def _request_polished_content(system_prompt: str, user_prompt: str) -> DiaryDraftContent:
    if not settings.llm_api_key or settings.llm_api_key == "your_api_key_here":
        raise LLMError("未配置 LLM_API_KEY，请在 backend/.env 中填写可用的大模型 API Key。")

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(base_url=settings.llm_base_url, timeout=60) as client:
            response = await client.post("/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise LLMError(f"大模型请求失败，状态码 {exc.response.status_code}：{detail}") from exc
    except httpx.HTTPError as exc:
        raise LLMError(f"无法连接大模型服务：{exc}") from exc

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LLMError("大模型响应格式不符合 OpenAI-compatible Chat Completions 结构。") from exc

    try:
        return DiaryDraftContent.model_validate(_parse_json_content(content))
    except ValidationError as exc:
        raise LLMError(f"大模型返回字段不完整或格式错误：{exc.errors()}") from exc


async def generate_learning_diary_draft(date: str, raw_text: str) -> DiaryDraftContent:
    return await _request_polished_content(
        system_prompt=DRAFT_SYSTEM_PROMPT,
        user_prompt=build_draft_user_prompt(date=date, raw_text=raw_text),
    )


async def rewrite_learning_diary_draft(
    date: str,
    raw_text: str,
    current_draft: DiaryDraftContent,
    feedback: str,
) -> DiaryDraftContent:
    current_draft_json = current_draft.model_dump_json()
    return await _request_polished_content(
        system_prompt=REWRITE_SYSTEM_PROMPT,
        user_prompt=build_rewrite_user_prompt(
            date=date,
            raw_text=raw_text,
            current_draft_json=current_draft_json,
            feedback=feedback,
        ),
    )
