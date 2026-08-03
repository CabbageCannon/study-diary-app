import json

import httpx
from pydantic import ValidationError

from app.config import settings
from app.models import AlgorithmAttempt, AlgorithmProblem, InterviewQuestion
from app.prompts import (
    ALGORITHM_AI_REVIEW_SYSTEM_PROMPT,
    ALGORITHM_HINT_SYSTEM_PROMPT,
    DRAFT_SYSTEM_PROMPT,
    INTERVIEW_EVALUATION_SYSTEM_PROMPT,
    INTERVIEW_QUESTION_REVIEW_SYSTEM_PROMPT,
    REWRITE_SYSTEM_PROMPT,
    build_algorithm_ai_review_prompt,
    build_algorithm_hint_prompt,
    build_draft_user_prompt,
    build_interview_evaluation_prompt,
    build_interview_question_review_prompt,
    build_rewrite_user_prompt,
)
from app.schemas import AlgorithmAIReview, AlgorithmHintContent, AnswerEvaluation, DiaryDraftContent, InterviewQuestionAIReview


class LLMError(RuntimeError):
    pass


class LLMFormatError(LLMError):
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
        raise LLMFormatError("大模型返回的内容不是有效 JSON。") from exc

    if not isinstance(parsed, dict):
        raise LLMFormatError("大模型返回的 JSON 结构不正确。")

    return parsed


async def _request_json_content(system_prompt: str, user_prompt: str) -> tuple[dict, str]:
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
        raise LLMFormatError("大模型响应格式不符合 OpenAI-compatible Chat Completions 结构。") from exc

    return _parse_json_content(content), content


async def _request_polished_content(system_prompt: str, user_prompt: str) -> DiaryDraftContent:
    parsed, _ = await _request_json_content(system_prompt, user_prompt)

    try:
        return DiaryDraftContent.model_validate(parsed)
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


async def review_interview_question(question: InterviewQuestion) -> tuple[InterviewQuestionAIReview, str]:
    """Return a validated AI review without changing question content or metadata."""

    prompt = build_interview_question_review_prompt(
        question=question.question,
        domain=question.domain,
        topic=question.topic,
        difficulty=question.difficulty,
        reference_points_json=json.dumps(question.reference_points, ensure_ascii=False),
        evaluation_rubric_json=json.dumps(question.evaluation_rubric, ensure_ascii=False),
        common_mistakes_json=json.dumps(question.common_mistakes, ensure_ascii=False),
        oral_answer_outline_json=json.dumps(question.oral_answer_outline, ensure_ascii=False),
        reference_answer=question.reference_answer,
        follow_up_questions_json=json.dumps(question.follow_up_questions, ensure_ascii=False),
        sources_json=json.dumps(question.sources, ensure_ascii=False),
    )
    last_error = ""
    for attempt in range(2):
        repair_instruction = "" if attempt == 0 else f"上一次输出未通过结构校验：{last_error}。请只返回符合要求的 JSON。"
        try:
            parsed, _ = await _request_json_content(
                INTERVIEW_QUESTION_REVIEW_SYSTEM_PROMPT,
                f"{prompt}\n{repair_instruction}",
            )
            review = InterviewQuestionAIReview.model_validate(parsed)
            return review, json.dumps(parsed, ensure_ascii=False)
        except (LLMFormatError, ValidationError) as exc:
            last_error = str(exc)

    raise LLMError("AI 审核结果格式错误，已进行一次修复重试。")


async def evaluate_interview_answer(question: InterviewQuestion, user_answer: str) -> tuple[AnswerEvaluation, str]:
    """Evaluate a saved answer with one bounded repair attempt for malformed model output."""

    prompt = build_interview_evaluation_prompt(
        question=question.question,
        reference_points_json=json.dumps(question.reference_points, ensure_ascii=False),
        evaluation_rubric_json=json.dumps(question.evaluation_rubric, ensure_ascii=False),
        common_mistakes_json=json.dumps(question.common_mistakes, ensure_ascii=False),
        user_answer=user_answer,
    )
    last_error = ""
    for attempt in range(2):
        repair_instruction = "" if attempt == 0 else f"上一次输出未通过结构校验：{last_error}。请只返回符合要求的 JSON。"
        try:
            parsed, _ = await _request_json_content(
                INTERVIEW_EVALUATION_SYSTEM_PROMPT,
                f"{prompt}\n{repair_instruction}",
            )
            evaluation = AnswerEvaluation.model_validate(parsed)
            return evaluation, json.dumps(parsed, ensure_ascii=False)
        except (LLMFormatError, ValidationError) as exc:
            last_error = str(exc)

    raise LLMError("大模型评价结果格式错误，已进行一次修复重试。")


async def generate_algorithm_hint(*, problem: AlgorithmProblem, approach: str, hint_level: int) -> str:
    """Return one progressive hint; never request or expose a copied full solution."""

    prompt = build_algorithm_hint_prompt(
        title=problem.title,
        title_zh=problem.title_zh or "",
        difficulty=problem.difficulty,
        topics_json=json.dumps(problem.topics, ensure_ascii=False),
        approach=approach,
        hint_level=hint_level,
    )
    last_error = ""
    for repair_attempt in range(2):
        repair_instruction = "" if repair_attempt == 0 else f"上一份输出未通过 JSON 校验：{last_error}。只返回符合 Schema 的 JSON。"
        try:
            parsed, _ = await _request_json_content(ALGORITHM_HINT_SYSTEM_PROMPT, f"{prompt}\n{repair_instruction}")
            return AlgorithmHintContent.model_validate(parsed).content
        except (LLMFormatError, ValidationError) as exc:
            last_error = str(exc)
    raise LLMError("AI 提示结果格式错误，已进行一次修复重试。")


async def generate_algorithm_ai_review(
    *,
    problem: AlgorithmProblem,
    attempt: AlgorithmAttempt,
    candidate_problem_ids: list[int],
) -> AlgorithmAIReview:
    """Review text only. Candidate IDs are supplied by the local catalog, never invented by the model."""

    prompt = build_algorithm_ai_review_prompt(
        title=problem.title,
        title_zh=problem.title_zh or "",
        difficulty=problem.difficulty,
        topics_json=json.dumps(problem.topics, ensure_ascii=False),
        result=attempt.result,
        approach=attempt.approach,
        time_complexity=attempt.time_complexity or "",
        space_complexity=attempt.space_complexity or "",
        code=attempt.code or "",
        reflection=attempt.reflection or "",
        mistakes=attempt.mistakes or "",
        edge_cases=attempt.edge_cases or "",
        hint_count=attempt.hint_count,
        candidate_problem_ids_json=json.dumps(candidate_problem_ids),
    )
    last_error = ""
    for repair_attempt in range(2):
        repair_instruction = "" if repair_attempt == 0 else f"上一份输出未通过 JSON 校验：{last_error}。只返回符合 Schema 的 JSON。"
        try:
            parsed, _ = await _request_json_content(ALGORITHM_AI_REVIEW_SYSTEM_PROMPT, f"{prompt}\n{repair_instruction}")
            return AlgorithmAIReview.model_validate(parsed)
        except (LLMFormatError, ValidationError) as exc:
            last_error = str(exc)
    raise LLMError("AI 复盘结果格式错误，已进行一次修复重试。")
