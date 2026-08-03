export type Difficulty = "easy" | "medium" | "hard";
export type ReviewStatus = "pending" | "verified" | "rejected";
export type ReviewMethod = "human" | "ai_auto" | "manual_override";
export type QuestionDomain = "agent" | "rag" | "llm_application" | "python" | "network" | "ai_engineering";
export type AnswerSource = "voice" | "text";
export type QuestionSetStatus = "in_progress" | "completed" | "abandoned";
export type QuestionSetItemStatus = "pending" | "answered" | "skipped";

export interface EvaluationRubricItem {
  point: string;
  weight: number;
  mandatory: boolean;
}

export interface InterviewQuestionSource {
  title: string;
  url: string;
  source_type: string;
  license: string;
  accessed_at: string;
}

export interface InterviewQuestion {
  id: string;
  domain: QuestionDomain;
  topic: string;
  subtopic: string;
  question: string;
  difficulty: Difficulty;
  question_type: string;
  expected_duration_seconds: number;
  tags: string[];
  reference_points: string[];
  evaluation_rubric: EvaluationRubricItem[];
  common_mistakes: string[];
  oral_answer_outline: string[];
  reference_answer: string;
  follow_up_questions: string[];
  sources: InterviewQuestionSource[];
  review_status: ReviewStatus;
  verified_by_human: boolean;
  human_quality_score: number | null;
  ai_quality_score: number | null;
  review_method: ReviewMethod | null;
  review_model: string | null;
  ai_review: InterviewQuestionAIReview | null;
  reviewed_at: string | null;
  quality_score: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InterviewQuestionReviewUpdate {
  question?: string;
  difficulty?: Difficulty;
  expected_duration_seconds?: number;
  tags?: string[];
  reference_points?: string[];
  evaluation_rubric?: EvaluationRubricItem[];
  common_mistakes?: string[];
  oral_answer_outline?: string[];
  reference_answer?: string;
  follow_up_questions?: string[];
  review_status?: ReviewStatus;
  human_quality_score?: number | null;
  quality_score?: number | null;
}

export interface InterviewQuestionAIReview {
  quality_score: number;
  clarity_score: number;
  technical_score: number;
  interview_value_score: number;
  source_support_score: number;
  factual_risk: boolean;
  duplicate_risk: boolean;
  issues: string[];
  suggested_changes: string[];
  recommended_status: "pending" | "verified";
}

export interface InterviewQuestionAIReviewResult {
  question: InterviewQuestion;
  review: InterviewQuestionAIReview;
  published: boolean;
  review_model: string;
}

export interface InterviewQuestionBatchItemResult {
  question_id: string;
  outcome: "reviewed" | "published" | "kept_pending" | "skipped" | "failed";
  message: string | null;
  review: InterviewQuestionAIReview | null;
}

export interface InterviewQuestionBatchResult {
  total: number;
  reviewed: number;
  published: number;
  kept_pending: number;
  failed: number;
  skipped: number;
  items: InterviewQuestionBatchItemResult[];
}

export type InterviewBatchJobType = "ai_review" | "quick_publish" | "reject";
export type InterviewBatchJobStatus = "queued" | "running" | "completed" | "partial_failed" | "failed";
export type InterviewBatchJobItemStatus = "pending" | "running" | "succeeded" | "skipped" | "failed";

export interface InterviewBatchJobCreatePayload {
  type: InterviewBatchJobType;
  question_ids: string[];
  auto_publish?: boolean;
}

export interface InterviewBatchJobItem {
  id: number;
  question_id: string;
  status: InterviewBatchJobItemStatus;
  outcome: string | null;
  message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface InterviewBatchJob {
  id: string;
  type: InterviewBatchJobType;
  status: InterviewBatchJobStatus;
  auto_publish: boolean;
  total: number;
  processed_count: number;
  succeeded_count: number;
  skipped_count: number;
  failed_count: number;
  published_count: number;
  kept_pending_count: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  items: InterviewBatchJobItem[];
}

export interface InterviewQuestionForTraining {
  id: string;
  domain: QuestionDomain;
  topic: string;
  difficulty: Difficulty;
  expected_duration_seconds: number;
  tags: string[];
  question: string;
}

export interface InterviewEvaluation {
  id: number;
  answer_id: number;
  correctness_score: number;
  completeness_score: number;
  structure_score: number;
  oral_clarity_score: number;
  total_score: number;
  matched_points: string[];
  incorrect_points: string[];
  missing_points: string[];
  improved_answer: string;
  follow_up_questions: string[];
  model_name: string;
  created_at: string;
}

export interface InterviewAnswer {
  id: number;
  question_set_id: number;
  question_id: string;
  attempt_index: number;
  answer_text: string;
  answer_source: AnswerSource;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewAnswerSubmission {
  answer: InterviewAnswer;
  evaluation: InterviewEvaluation | null;
  evaluation_status: "completed" | "failed";
  evaluation_error: string | null;
  next_review_at: string | null;
}

export interface InterviewQuestionSetItem {
  id: number;
  order_index: number;
  status: QuestionSetItemStatus;
  question: InterviewQuestionForTraining;
  latest_answer: InterviewAnswer | null;
  latest_evaluation: InterviewEvaluation | null;
  next_review_at: string | null;
}

export interface InterviewQuestionSet {
  id: number;
  date: string;
  domain: QuestionDomain | null;
  topic: string | null;
  difficulty: Difficulty | null;
  question_count: number;
  available_question_count: number;
  availability_message: string | null;
  status: QuestionSetStatus;
  current_index: number;
  last_active_question_id: string | null;
  include_due_reviews: boolean;
  random_order: boolean;
  created_at: string;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  updated_at: string;
  items: InterviewQuestionSetItem[];
  current_question: InterviewQuestionForTraining | null;
}

export interface InterviewQuestionSetSummary {
  id: number;
  date: string;
  domain: QuestionDomain | null;
  topic: string | null;
  difficulty: Difficulty | null;
  question_count: number;
  answered_count: number;
  skipped_count: number;
  status: QuestionSetStatus;
  average_score: number | null;
  created_at: string;
  last_active_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
}

export interface InterviewTrainingDomainStat {
  domain: QuestionDomain;
  answered_count: number;
  average_score: number | null;
}

export interface InterviewTrainingStats {
  streak_days: number;
  today_answered_count: number;
  total_answered_count: number;
  due_review_count: number;
  recent_average_score: number | null;
  in_progress_count: number;
  last_training_at: string | null;
  domains: InterviewTrainingDomainStat[];
}

export interface InterviewReviewSchedule {
  id: number;
  question_id: string;
  last_answer_id: number;
  last_score: number;
  next_review_at: string;
  review_interval_days: number;
  review_count: number;
  question: InterviewQuestionForTraining;
}

export interface CreateQuestionSetPayload {
  domain?: QuestionDomain;
  topic?: string;
  difficulty?: Difficulty;
  question_count: number;
  include_due_reviews: boolean;
  random_order: boolean;
}

export interface SubmitInterviewAnswerPayload {
  question_id: string;
  answer_text: string;
  answer_source: AnswerSource;
  duration_seconds?: number;
}

export interface UpdateInterviewQuestionSetProgressPayload {
  current_index: number;
  last_active_question_id?: string;
}
