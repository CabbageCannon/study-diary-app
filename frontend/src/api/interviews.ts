import { cachedRequest, invalidateCachedRequests, peekCachedRequest, primeCachedRequest, request } from "./client";
import type {
  CreateQuestionSetPayload,
  InterviewAnswerSubmission,
  InterviewBatchJob,
  InterviewBatchJobCreatePayload,
  InterviewQuestion,
  InterviewQuestionAIReviewResult,
  InterviewQuestionBatchResult,
  InterviewQuestionReviewUpdate,
  InterviewQuestionSet,
  InterviewQuestionSetSummary,
  InterviewReviewSchedule,
  ReviewStatus,
  SubmitInterviewAnswerPayload,
  InterviewTrainingStats,
  QuestionSetStatus,
  UpdateInterviewQuestionSetProgressPayload,
} from "../types/interview";

interface QuestionFilters {
  domain?: string;
  topic?: string;
  difficulty?: string;
  reviewStatus?: ReviewStatus;
  count?: number;
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function listInterviewQuestions(filters: QuestionFilters = {}, signal?: AbortSignal): Promise<InterviewQuestion[]> {
  return request<InterviewQuestion[]>(
    `/api/interviews/questions${toQuery({
      domain: filters.domain,
      topic: filters.topic,
      difficulty: filters.difficulty,
      review_status: filters.reviewStatus,
      count: filters.count ?? 100,
    })}`,
    { signal },
  );
}

export function reviewInterviewQuestion(questionId: string, payload: InterviewQuestionReviewUpdate): Promise<InterviewQuestion> {
  return request<InterviewQuestion>(`/api/interviews/questions/${questionId}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function aiReviewInterviewQuestion(questionId: string, autoPublish = false): Promise<InterviewQuestionAIReviewResult> {
  return request<InterviewQuestionAIReviewResult>(`/api/interviews/questions/${questionId}/ai-review`, {
    method: "POST",
    body: JSON.stringify({ auto_publish: autoPublish }),
  });
}

export function applyAiInterviewReview(questionId: string): Promise<InterviewQuestionAIReviewResult> {
  return request<InterviewQuestionAIReviewResult>(`/api/interviews/questions/${questionId}/ai-review/apply`, { method: "POST" });
}

export function batchAiReviewInterviewQuestions(questionIds: string[], autoPublish = false): Promise<InterviewQuestionBatchResult> {
  return request<InterviewQuestionBatchResult>("/api/interviews/questions/ai-review-batch", {
    method: "POST",
    body: JSON.stringify({ question_ids: questionIds, auto_publish: autoPublish }),
  });
}

export function quickPublishInterviewQuestions(questionIds: string[]): Promise<InterviewQuestionBatchResult> {
  return request<InterviewQuestionBatchResult>("/api/interviews/questions/publish-batch", {
    method: "POST",
    body: JSON.stringify({ question_ids: questionIds }),
  });
}

export function rejectInterviewQuestions(questionIds: string[]): Promise<InterviewQuestionBatchResult> {
  return request<InterviewQuestionBatchResult>("/api/interviews/questions/reject-batch", {
    method: "POST",
    body: JSON.stringify({ question_ids: questionIds }),
  });
}

export function createInterviewBatchJob(payload: InterviewBatchJobCreatePayload): Promise<InterviewBatchJob> {
  return request<InterviewBatchJob>("/api/interviews/batch-jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listInterviewBatchJobs(signal?: AbortSignal): Promise<InterviewBatchJob[]> {
  return request<InterviewBatchJob[]>("/api/interviews/batch-jobs?limit=12", { signal });
}

export function createInterviewQuestionSet(payload: CreateQuestionSetPayload): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>("/api/interviews/question-sets", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    invalidateCachedRequests("/api/interviews/question-sets?", "/api/interviews/stats");
    return questionSet;
  });
}

export function getInterviewQuestionSet(setId: number, _signal?: AbortSignal, force = false): Promise<InterviewQuestionSet> {
  return cachedRequest<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}`, undefined, force);
}

function questionSetListPath(options: { status?: QuestionSetStatus; limit?: number } = {}) {
  return `/api/interviews/question-sets${toQuery({ status: options.status, limit: options.limit ?? 50 })}`;
}

export function listInterviewQuestionSets(options: { status?: QuestionSetStatus; limit?: number; signal?: AbortSignal; force?: boolean } = {}): Promise<InterviewQuestionSetSummary[]> {
  return cachedRequest<InterviewQuestionSetSummary[]>(questionSetListPath(options), undefined, options.force);
}

export function peekInterviewQuestionSets(options: { status?: QuestionSetStatus; limit?: number } = {}) {
  return peekCachedRequest<InterviewQuestionSetSummary[]>(questionSetListPath(options));
}

export function peekInterviewQuestionSet(setId: number) {
  return peekCachedRequest<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}`);
}

export function primeInterviewQuestionSet(questionSet: InterviewQuestionSet) {
  primeCachedRequest(`/api/interviews/question-sets/${questionSet.id}`, questionSet);
}

export function getInterviewTrainingStats(_signal?: AbortSignal, force = false): Promise<InterviewTrainingStats> {
  return cachedRequest<InterviewTrainingStats>("/api/interviews/stats", undefined, force);
}

export function peekInterviewTrainingStats() {
  return peekCachedRequest<InterviewTrainingStats>("/api/interviews/stats");
}

export function updateInterviewQuestionSetProgress(
  setId: number,
  payload: UpdateInterviewQuestionSetProgressPayload,
): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/progress`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    return questionSet;
  });
}

export function completeInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/complete`, { method: "POST" }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    invalidateCachedRequests("/api/interviews/question-sets?", "/api/interviews/stats");
    return questionSet;
  });
}

export function abandonInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/abandon`, { method: "POST" }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    invalidateCachedRequests("/api/interviews/question-sets?", "/api/interviews/stats");
    return questionSet;
  });
}

export function restartInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/restart`, { method: "POST" }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    invalidateCachedRequests("/api/interviews/question-sets?", "/api/interviews/stats");
    return questionSet;
  });
}

export function deleteInterviewQuestionSet(setId: number): Promise<void> {
  return request<void>(`/api/interviews/question-sets/${setId}`, { method: "DELETE" }).then(() => {
    invalidateCachedRequests(`/api/interviews/question-sets/${setId}`, "/api/interviews/question-sets?", "/api/interviews/stats");
  });
}

export function skipInterviewQuestion(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/skip`, { method: "POST" }).then((questionSet) => {
    primeInterviewQuestionSet(questionSet);
    return questionSet;
  });
}

export function submitInterviewAnswer(
  setId: number,
  payload: SubmitInterviewAnswerPayload,
): Promise<InterviewAnswerSubmission> {
  return request<InterviewAnswerSubmission>(`/api/interviews/question-sets/${setId}/answers`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((submission) => {
    invalidateCachedRequests("/api/interviews/question-sets?", "/api/interviews/stats");
    return submission;
  });
}

export function retryInterviewAnswer(answerId: number, payload: SubmitInterviewAnswerPayload): Promise<InterviewAnswerSubmission> {
  return request<InterviewAnswerSubmission>(`/api/interviews/answers/${answerId}/retry`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function evaluateInterviewAnswer(answerId: number): Promise<InterviewAnswerSubmission> {
  return request<InterviewAnswerSubmission>(`/api/interviews/answers/${answerId}/evaluate`, { method: "POST" });
}

export function listDueInterviewReviews(domain?: string): Promise<InterviewReviewSchedule[]> {
  return request<InterviewReviewSchedule[]>(`/api/interviews/reviews/due${toQuery({ domain, limit: 100 })}`);
}
