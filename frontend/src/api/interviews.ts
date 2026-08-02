import { request } from "./client";
import type {
  CreateQuestionSetPayload,
  InterviewAnswerSubmission,
  InterviewQuestion,
  InterviewQuestionAIReviewResult,
  InterviewQuestionBatchResult,
  InterviewQuestionReviewUpdate,
  InterviewQuestionSet,
  InterviewQuestionSetSummary,
  InterviewReviewSchedule,
  ReviewStatus,
  SubmitInterviewAnswerPayload,
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

export function listInterviewQuestions(filters: QuestionFilters = {}): Promise<InterviewQuestion[]> {
  return request<InterviewQuestion[]>(
    `/api/interviews/questions${toQuery({
      domain: filters.domain,
      topic: filters.topic,
      difficulty: filters.difficulty,
      review_status: filters.reviewStatus,
      count: filters.count ?? 100,
    })}`,
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

export function createInterviewQuestionSet(payload: CreateQuestionSetPayload): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>("/api/interviews/question-sets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getInterviewQuestionSet(setId: number): Promise<InterviewQuestionSet> {
  return request<InterviewQuestionSet>(`/api/interviews/question-sets/${setId}`);
}

export function listInterviewQuestionSets(): Promise<InterviewQuestionSetSummary[]> {
  return request<InterviewQuestionSetSummary[]>("/api/interviews/question-sets?limit=50");
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
