import { cachedRequest, invalidateCachedRequests, peekCachedRequest, primeCachedRequest, request } from "./client";
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

export function getAlgorithmDailyFeed(force = false) {
  return cachedRequest<AlgorithmDailyFeed>("/api/algorithms/daily-feed", undefined, force);
}

export function peekAlgorithmDailyFeed() {
  return peekCachedRequest<AlgorithmDailyFeed>("/api/algorithms/daily-feed");
}

export function refreshAlgorithmDailyFeed() {
  return request<AlgorithmDailyFeed>("/api/algorithms/daily-feed/refresh", { method: "POST" }).then((feed) => {
    primeCachedRequest("/api/algorithms/daily-feed", feed);
    return feed;
  });
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
  return request<AlgorithmSession>("/api/algorithms/sessions", { method: "POST", body: JSON.stringify(payload) }).then((session) => {
    primeCachedRequest(`/api/algorithms/sessions/${session.id}`, session);
    invalidateCachedRequests("/api/algorithms/sessions?", "/api/algorithms/stats");
    return session;
  });
}

function algorithmSessionsPath(status?: string) {
  return `/api/algorithms/sessions${queryString({ status, limit: 60 })}`;
}

export function listAlgorithmSessions(status?: string, force = false) {
  return cachedRequest<AlgorithmSessionSummary[]>(algorithmSessionsPath(status), undefined, force);
}

export function peekAlgorithmSessions(status?: string) {
  return peekCachedRequest<AlgorithmSessionSummary[]>(algorithmSessionsPath(status));
}

export function getAlgorithmSession(id: string, force = false) {
  return cachedRequest<AlgorithmSession>(`/api/algorithms/sessions/${id}`, undefined, force);
}

export function peekAlgorithmSession(id: string) {
  return peekCachedRequest<AlgorithmSession>(`/api/algorithms/sessions/${id}`);
}

export function updateAlgorithmSessionProgress(id: string, currentIndex: number, itemStatus?: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ current_index: currentIndex, item_status: itemStatus }),
  }).then((session) => {
    primeCachedRequest(`/api/algorithms/sessions/${id}`, session);
    return session;
  });
}

export function skipAlgorithmSessionProblem(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/skip`, { method: "POST" }).then((session) => {
    primeCachedRequest(`/api/algorithms/sessions/${id}`, session);
    return session;
  });
}

export function completeAlgorithmSession(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/complete`, { method: "POST" }).then((session) => {
    invalidateCachedRequests("/api/algorithms/sessions", "/api/algorithms/stats");
    return session;
  });
}

export function abandonAlgorithmSession(id: string) {
  return request<AlgorithmSession>(`/api/algorithms/sessions/${id}/abandon`, { method: "POST" }).then((session) => {
    invalidateCachedRequests("/api/algorithms/sessions", "/api/algorithms/stats");
    return session;
  });
}

export function deleteAlgorithmSession(id: string) {
  return request<void>(`/api/algorithms/sessions/${id}`, { method: "DELETE" }).then(() => {
    invalidateCachedRequests("/api/algorithms/sessions", "/api/algorithms/stats");
  });
}

export function saveAlgorithmAttempt(payload: SaveAlgorithmAttemptPayload) {
  return request<AlgorithmAttempt>("/api/algorithms/attempts", { method: "POST", body: JSON.stringify(payload) }).then((attempt) => {
    invalidateCachedRequests("/api/algorithms/stats", "/api/algorithms/sessions?");
    return attempt;
  });
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

export function getAlgorithmStats(force = false) {
  return cachedRequest<AlgorithmStats>("/api/algorithms/stats", undefined, force);
}

export function peekAlgorithmStats() {
  return peekCachedRequest<AlgorithmStats>("/api/algorithms/stats");
}

export function getAlgorithmWeaknesses() {
  return request<AlgorithmWeakness[]>("/api/algorithms/weaknesses");
}

export function getSimilarAlgorithmProblems(problemId: number | string) {
  return request<AlgorithmProblem[]>(`/api/algorithms/problems/${problemId}/similar`);
}
