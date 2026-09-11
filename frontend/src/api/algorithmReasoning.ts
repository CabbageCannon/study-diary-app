import { ApiRequestError, cachedRequest, invalidateCachedRequests, request } from "./client";
import type {
  AlgorithmReasoningAnswer,
  AlgorithmReasoningCheckPayload,
  AlgorithmReasoningCheckResponse,
  AlgorithmReasoningContextResponse,
  AlgorithmReasoningFeedback,
  AlgorithmReasoningRetry,
  AlgorithmReasoningProblemContext,
} from "../types/algorithmReasoning";

const FIXTURE_STORAGE_KEY = "study-diary:algorithm-reasoning-fixtures";

function hasFixtureQueryFlag() {
  return new URLSearchParams(window.location.search).get("reasoningFixture") === "1";
}

export function isAlgorithmReasoningFixtureEnabled() {
  const envEnabled = import.meta.env.VITE_USE_ALGORITHM_REASONING_FIXTURES === "true";
  if (!import.meta.env.DEV && !envEnabled) {
    return false;
  }

  return envEnabled || hasFixtureQueryFlag() || window.localStorage.getItem(FIXTURE_STORAGE_KEY) === "1";
}

export function setAlgorithmReasoningFixtureEnabled(enabled: boolean) {
  if (enabled) {
    window.localStorage.setItem(FIXTURE_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(FIXTURE_STORAGE_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has("reasoningFixture")) {
      url.searchParams.delete("reasoningFixture");
      window.history.replaceState(window.history.state, "", url);
    }
  }
}

export async function getAlgorithmReasoningContext(problemId: number | string) {
  if (isAlgorithmReasoningFixtureEnabled()) {
    return fixtureContextResponse(String(problemId));
  }

  return cachedRequest<AlgorithmReasoningContextResponse>(`/api/algorithms/problems/${problemId}/reasoning-context`);
}

export async function checkAlgorithmReasoningAnswer(payload: AlgorithmReasoningCheckPayload) {
  if (isAlgorithmReasoningFixtureEnabled()) {
    await fixtureDelay();
    return fixtureCheckResponse(payload);
  }

  return request<AlgorithmReasoningCheckResponse>("/api/algorithms/reasoning/checks", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(invalidateAlgorithmTrainingCaches);
}

export async function saveAlgorithmReasoningAnswer(payload: AlgorithmReasoningCheckPayload) {
  if (isAlgorithmReasoningFixtureEnabled()) {
    await fixtureDelay();
    return { answer: fixtureAnswer(payload, "not_attempted"), feedback: null };
  }

  return request<{ answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null }>(
    "/api/algorithms/reasoning/answers",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function retryAlgorithmReasoningCheck(answerId: number) {
  if (isAlgorithmReasoningFixtureEnabled()) {
    await fixtureDelay();
    return fixtureRetryResponse(answerId);
  }

  return request<AlgorithmReasoningCheckResponse>(`/api/algorithms/reasoning/answers/${answerId}/check`, {
    method: "POST",
    body: JSON.stringify({ refresh: false }),
  }).then(invalidateAlgorithmTrainingCaches);
}

function invalidateAlgorithmTrainingCaches<T>(response: T) {
  invalidateCachedRequests("/api/algorithms/daily-feed", "/api/algorithms/sessions", "/api/algorithms/stats", "/api/algorithms/problems", "/api/algorithms/catalog-overview");
  return response;
}

export async function getAlgorithmReasoningAnswer(answerId: number) {
  return request<{ answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null }>(
    `/api/algorithms/reasoning/answers/${answerId}`,
  );
}

export async function findAlgorithmReasoningAnswerByClientId(clientAnswerId: string) {
  if (isAlgorithmReasoningFixtureEnabled()) {
    return [] as { answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null; retry: AlgorithmReasoningRetry | null }[];
  }

  const search = new URLSearchParams({ client_answer_id: clientAnswerId, limit: "1" });
  const response = await request<
    | { answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null; retry: AlgorithmReasoningRetry | null }[]
    | { items: { answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null; retry: AlgorithmReasoningRetry | null }[] }
  >(
    `/api/algorithms/reasoning/answers?${search.toString()}`,
  );
  return Array.isArray(response) ? response : response.items;
}

function fixtureDelay() {
  return new Promise((resolve) => window.setTimeout(resolve, 380));
}

const twoSumContext: AlgorithmReasoningProblemContext = {
  schema_version: 1,
  problem_key: "leetcode-1",
  title: "Two Sum",
  title_zh: "两数之和",
  statement_zh: "给定一个整数数组和目标值，找到数组中两个不同位置的数，使它们相加等于目标值，并返回这两个位置。",
  input_output: {
    input: "整数数组 nums 和整数 target。",
    output: "两个下标组成的数组；同一个元素不能重复使用。",
  },
  constraints: ["恰好存在一个可用答案。", "同一数组位置不能使用两次。"],
  examples: [
    {
      input: "nums = [2, 7, 11, 15], target = 9",
      output: "[0, 1]",
      explanation: "2 + 7 = 9。",
    },
    {
      input: "nums = [3, 3], target = 6",
      output: "[0, 1]",
      explanation: "重复值来自两个不同位置。",
    },
  ],
  source: {
    name: "LeetCode CN 1. 两数之和",
    url: "https://leetcode.cn/problems/two-sum/",
    license_note: "题意为原创中文转写，未复制外站题面或题解。",
    source_version: "2026-09-06 示例上下文",
  },
  content_status: "ready",
  content_version: 3,
};

function fixtureContextResponse(problemId: string): AlgorithmReasoningContextResponse {
  return {
    problem_id: problemId,
    reasoning_available: true,
    context: { ...twoSumContext, problem_key: problemId },
  };
}

function answerIdFromClientId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 9000;
  }
  return 1000 + hash;
}

function fixtureAnswer(payload: AlgorithmReasoningCheckPayload, checkStatus: AlgorithmReasoningAnswer["check_status"]): AlgorithmReasoningAnswer {
  const now = new Date().toISOString();
  return {
    answer_id: answerIdFromClientId(payload.client_answer_id),
    problem_id: payload.problem_id,
    session_id: payload.session_id,
    version: payload.revision_of_answer_id ? 2 : 1,
    revision_of_answer_id: payload.revision_of_answer_id,
    answer_text: payload.answer_text,
    answer_source: payload.answer_source,
    details: payload.details,
    client_answer_id: payload.client_answer_id,
    save_status: "saved",
    check_status: checkStatus,
    saved_at: now,
    checked_at: checkStatus === "completed" ? now : null,
  };
}

function fixtureFeedback(answer: AlgorithmReasoningAnswer): AlgorithmReasoningFeedback {
  const hasLookupOrder = /先查|补数|target\s*-|target 减|差在不在/.test(answer.answer_text);
  return {
    feedback_id: answer.answer_id + 5000,
    answer_id: answer.answer_id,
    conclusion: hasLookupOrder ? "correct" : "partially_correct",
    accuracy_score: hasLookupOrder ? 100 : 65,
    headline: hasLookupOrder
      ? "思路成立。你已经讲清楚先查补数再存当前值，能避免复用同一位置。"
      : "方向成立。还需要说明先查补数再存当前值，这样不会把同一个位置使用两次。",
    context_sufficient: true,
    correct_parts: [
      {
        point: "用哈希表记录已见过的数，避免两层循环。",
        quote: answer.answer_text.includes("哈希") ? "哈希表" : null,
      },
    ],
    issues_or_missing: hasLookupOrder
      ? []
      : [
          {
            type: "missing",
            detail: "没有说明查找顺序：应先查 target - x 是否已在表中，再把当前元素存入。",
            quote: null,
            verification_point_id: "vp-lookup-before-store",
          },
        ],
    counterexample_or_followup: hasLookupOrder
      ? { kind: "none", content: null }
      : {
          kind: "followup",
          content: "如果数组是 [3, 3]、target = 6，先存再查会发生什么？",
        },
    complexity: {
      time: {
        user_claim: answer.details.time_complexity,
        assessment: answer.details.time_complexity ? "correct" : "not_stated",
        expected: "O(n)",
        note: "哈希一次遍历为 O(n)。未陈述复杂度不算错误。",
      },
      space: {
        user_claim: answer.details.space_complexity,
        assessment: answer.details.space_complexity ? "correct" : "not_stated",
        expected: "O(n)",
        note: "哈希表最多存 n 个元素。",
      },
    },
    alternative_approaches_accepted: [],
    reference_outline: "遍历中对当前数 x 先查 target - x 是否已存在，命中则返回两个下标；否则把 x 和下标存入哈希表。",
    needs_review: !hasLookupOrder,
    model_name: "fixture-reasoning-v1",
    prompt_version: "reasoning-check-v1",
    context_version: 3,
    created_at: new Date().toISOString(),
  };
}

function fixtureCheckResponse(payload: AlgorithmReasoningCheckPayload): AlgorithmReasoningCheckResponse {
  if (!payload.answer_text.trim()) {
    throw new ApiRequestError("回答不能为空，请先描述你的思路。", 422);
  }

  const answer = fixtureAnswer(payload, payload.answer_text.includes("模拟核对失败") ? "failed" : "completed");
  if (answer.check_status === "failed") {
    return {
      save_status: "saved",
      check_status: "failed",
      answer,
      feedback: null,
      save_error: null,
      check_error: "开发 fixture：模拟大模型服务暂时不可用。回答已保存，可重试核对。",
      retry: { check_url: `/api/algorithms/reasoning/answers/${answer.answer_id}/check`, method: "POST" },
      problem_context: { problem_id: payload.problem_id, content_version: 3, reasoning_available: true },
    };
  }

  return {
    save_status: "saved",
    check_status: "completed",
    answer,
    feedback: fixtureFeedback(answer),
    save_error: null,
    check_error: null,
    retry: null,
    problem_context: { problem_id: payload.problem_id, content_version: 3, reasoning_available: true },
  };
}

function fixtureRetryResponse(answerId: number): AlgorithmReasoningCheckResponse {
  const answer: AlgorithmReasoningAnswer = {
    answer_id: answerId,
    problem_id: "leetcode-1",
    session_id: null,
    version: 1,
    revision_of_answer_id: null,
    answer_text: "遍历数组，用哈希表记录见过的数，对当前数先查补数是否存在，再存当前值。",
    answer_source: "text",
    details: { time_complexity: "O(n)", space_complexity: "O(n)", code: null, notes: null },
    client_answer_id: `fixture-retry-${answerId}`,
    save_status: "saved",
    check_status: "completed",
    saved_at: new Date().toISOString(),
    checked_at: new Date().toISOString(),
  };
  return {
    save_status: "saved",
    check_status: "completed",
    answer,
    feedback: fixtureFeedback(answer),
    save_error: null,
    check_error: null,
    retry: null,
    problem_context: { problem_id: answer.problem_id, content_version: 3, reasoning_available: true },
  };
}
