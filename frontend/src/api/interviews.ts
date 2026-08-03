import { request } from "./client";
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
  });
}

export function getInterviewQuestionSet(setId: number, signal?: AbortSignal): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}`, { signal });
}

export function listInterviewQuestionSets(options: { status?: QuestionSetStatus; limit?: number; signal?: AbortSignal } = {}): Promise<InterviewQuestionSetSummary[]> {
  return request<InterviewQuestionSetSummary[]>(
    `/api/interviews/question-sets${toQuery({ status: options.status, limit: options.limit ?? 50 })}`,
    { signal: options.signal },
  );
}

export function getInterviewTrainingStats(signal?: AbortSignal): Promise<InterviewTrainingStats> {
  return request<InterviewTrainingStats>("/api/interviews/stats", { signal });
}

export function updateInterviewQuestionSetProgress(
  setId: number,
  payload: UpdateInterviewQuestionSetProgressPayload,
): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/progress`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function completeInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/complete`, { method: "POST" });
}

export function abandonInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/abandon`, { method: "POST" });
}

export function restartInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/restart`, { method: "POST" });
}

export function deleteInterviewQuestionSet(setId: number): Promise<void> {
  return request<void>(`/api/interviews/question-sets/${setId}`, { method: "DELETE" });
}

export function skipInterviewQuestion(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}/skip`, { method: "POST" });
}

export function submitInterviewAnswer(
  setId: number,
  payload: SubmitInterviewAnswerPayload,
): Promise<InterviewAnswerSubmission> {
  return request<InterviewAnswerSubmission>(`/api/interviews/question-sets/${setId}/answers`, {
    method: "POST",
    body: JSON.stringify(payload),
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
