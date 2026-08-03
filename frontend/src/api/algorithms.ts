import { request } from "./client";
import type {
  AlgorithmAttempt,
  AlgorithmCatalogOverview,
  AlgorithmDailyFeed,
  AlgorithmDailyRecommendationSettings,
  AlgorithmDifficulty,
  AlgorithmHintRead,
  AlgorithmProblem,
  AlgorithmReviewSchedule,
  AlgorithmSession,
  AlgorithmSessionSummary,
  AlgorithmStats,
  AlgorithmWeakness,
  CreateAlgorithmSessionPayload,
  SaveAlgorithmAttemptPayload,
  UpdateAlgorithmDailyRecommendationSettingsPayload,
} from "../types/algorithm";

function queryString(values: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function listAlgorithmProblems(filters: { difficulty?: AlgorithmDifficulty; topic?: string; source_list?: string; search?: string; completed?: boolean; needs_review?: boolean; limit?: number } = {}) {
  return request<AlgorithmProblem[]>(`/api/algorithms/problems${queryString(filters)}`);
}

export function getAlgorithmProblem(id: number | string) {
  return request<AlgorithmProblem>(`/api/algorithms/problems/${id}`);
}

export function getDailyAlgorithmProblem() {
  return request<AlgorithmProblem>("/api/algorithms/daily");
}

export function getAlgorithmDailyFeed() {
  return request<AlgorithmDailyFeed>("/api/algorithms/daily-feed");
}

export function refreshAlgorithmDailyFeed() {
  return request<AlgorithmDailyFeed>("/api/algorithms/daily-feed/refresh", { method: "POST" });
}

export function getAlgorithmDailySettings() {
  return request<AlgorithmDailyRecommendationSettings>("/api/algorithms/daily-settings");
}

export function updateAlgorithmDailySettings(payload: UpdateAlgorithmDailyRecommendationSettingsPayload) {
  return request<AlgorithmDailyRecommendationSettings>("/api/algorithms/daily-settings", { method: "PATCH", body: JSON.stringify(payload) });
}

export function getAlgorithmCatalogOverview() {
  return request<AlgorithmCatalogOverview>("/api/algorithms/catalog-overview");
}

export function createAlgorithmSession(payload: CreateAlgorithmSessionPayload) {
  return request<AlgorithmSession>("/api/algorithms/sessions", { method: "POST", body: JSON.stringify(payload) });
}

export function listAlgorithmSessions(status?: string) {
  return request<AlgorithmSessionSummary[]>(`/api/algorithms/sessions${queryString({ status, limit: 60 })}`);
}

export function getAlgorithmSession(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}`);
}

export function updateAlgorithmSessionProgress(id: string, currentIndex: number, itemStatus?: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ current_index: currentIndex, item_status: itemStatus }),
  });
}

export function skipAlgorithmSessionProblem(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/skip`, { method: "POST" });
}

export function completeAlgorithmSession(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/complete`, { method: "POST" });
}

export function abandonAlgorithmSession(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/abandon`, { method: "POST" });
}

export function deleteAlgorithmSession(id: string) {
  return request<void>(`/api/algorithms/sessions/${id}`, { method: "DELETE" });
}

export function saveAlgorithmAttempt(payload: SaveAlgorithmAttemptPayload) {
  return request<AlgorithmAttempt>("/api/algorithms/attempts", { method: "POST", body: JSON.stringify(payload) });
}

export function listAlgorithmAttempts(filters: { problem_id?: number; session_id?: string } = {}) {
  return request<AlgorithmAttempt[]>(`/api/algorithms/attempts${queryString(filters)}`);
}

export function getAlgorithmAttempt(id: number) {
  return request<AlgorithmAttempt>(`/api/algorithms/attempts/${id}`);
}

export function deleteAlgorithmAttempt(id: number) {
  return request<void>(`/api/algorithms/attempts/${id}`, { method: "DELETE" });
}

export function requestAlgorithmHint(id: number, hintLevel: number, approach: string) {
  return request<AlgorithmHintRead>(`/api/algorithms/attempts/${id}/hint`, {
    method: "POST",
    body: JSON.stringify({ hint_level: hintLevel, approach }),
  });
}

export function requestAlgorithmAiReview(id: number) {
  return request<AlgorithmAttempt>(`/api/algorithms/attempts/${id}/ai-review`, { method: "POST" });
}

export function listDueAlgorithmReviews() {
  return request<AlgorithmReviewSchedule[]>("/api/algorithms/reviews/due?limit=50");
}

export function createAlgorithmReviewSession(count = 5) {
  return request<AlgorithmSession>(`/api/algorithms/reviews/session?count=${count}`, { method: "POST" });
}

export function getAlgorithmStats() {
  return request<AlgorithmStats>("/api/algorithms/stats");
}

export function getAlgorithmWeaknesses() {
  return request<AlgorithmWeakness[]>("/api/algorithms/weaknesses");
}

export function getSimilarAlgorithmProblems(problemId: number | string) {
  return request<AlgorithmProblem[]>(`/api/algorithms/problems/${problemId}/similar`);
}
