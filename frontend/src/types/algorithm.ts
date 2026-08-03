export type AlgorithmDifficulty = "easy" | "medium" | "hard";
export type AlgorithmTrainingMode = "daily" | "hot100" | "topic" | "difficulty" | "random" | "weakness" | "wrong" | "similar" | "custom" | "review";
export type AlgorithmSessionStatus = "in_progress" | "completed" | "abandoned";
export type AlgorithmItemStatus = "pending" | "in_progress" | "solved" | "needs_review" | "skipped";
export type AlgorithmAttemptResult = "solved" | "partially_solved" | "failed" | "gave_up";

export interface AlgorithmProblem {
  id: number;
  stable_key: string;
  platform: string;
  external_id: string;
  title: string;
  title_zh: string | null;
  slug: string;
  url: string;
  difficulty: AlgorithmDifficulty;
  pattern_key: string;
  topics: string[];
  source_lists: string[];
  source_name: string;
  source_license: string;
  is_active: boolean;
  created_at: string;
}

export interface AlgorithmAiReview {
  summary: string;
  approach_assessment: string;
  correct_parts: string[];
  issues: string[];
  missing_edge_cases: string[];
  time_complexity_assessment: { user_claim: string; suggested: string; is_likely_correct: boolean; reason: string };
  space_complexity_assessment: { user_claim: string; suggested: string; is_likely_correct: boolean; reason: string };
  code_review: { has_code: boolean; possible_bugs: string[]; readability_suggestions: string[] };
  better_approach: string;
  reflection_prompt: string;
  needs_review: boolean;
  weak_topics: string[];
  recommended_problem_ids: number[];
}

export interface AlgorithmHintRead {
  hint_level: number;
  content: string;
  remaining_hint_levels: number;
}

export interface AlgorithmAttempt {
  id: number;
  problem_id: number;
  session_id: string | null;
  session_item_id: number | null;
  started_at: string;
  submitted_at: string | null;
  duration_seconds: number | null;
  result: AlgorithmAttemptResult;
  language: string | null;
  approach: string;
  time_complexity: string | null;
  space_complexity: string | null;
  code: string | null;
  reflection: string | null;
  mistakes: string | null;
  edge_cases: string | null;
  hint_count: number;
  needs_review: boolean;
  ai_feedback: AlgorithmAiReview | null;
  ai_feedback_status: "not_requested" | "processing" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

export interface AlgorithmSessionItem {
  id: number;
  problem_id: number;
  position: number;
  status: AlgorithmItemStatus;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  problem: AlgorithmProblem;
  latest_attempt: AlgorithmAttempt | null;
  attempt_count: number;
}

export interface AlgorithmSession {
  id: string;
  mode: AlgorithmTrainingMode;
  status: AlgorithmSessionStatus;
  requested_count: number;
  question_count: number;
  current_index: number;
  filters: Record<string, unknown>;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  created_at: string;
  updated_at: string;
  items: AlgorithmSessionItem[];
  available_problem_count: number;
  availability_message: string | null;
}

export interface AlgorithmSessionSummary {
  id: string;
  mode: AlgorithmTrainingMode;
  status: AlgorithmSessionStatus;
  question_count: number;
  solved_count: number;
  needs_review_count: number;
  current_index: number;
  started_at: string;
  last_active_at: string;
  completed_at: string | null;
}

export interface AlgorithmReviewSchedule {
  problem: AlgorithmProblem;
  next_review_at: string;
  interval_days: number;
  review_count: number;
  mastery_level: number;
  reason: string;
  last_attempt: AlgorithmAttempt | null;
}

export interface AlgorithmStats {
  current_streak_days: number;
  today_completed_count: number;
  total_attempt_count: number;
  unique_solved_count: number;
  completed_by_difficulty: Record<string, number>;
  completed_by_topic: Record<string, number>;
  success_rate_by_topic: Record<string, number>;
  average_duration_seconds: number | null;
  due_review_count: number;
  wrong_problem_count: number;
  in_progress_session_count: number;
  recent_7_days: { date: string; attempt_count: number }[];
  recent_30_days: { date: string; attempt_count: number }[];
}

export interface AlgorithmWeakness {
  topic: string;
  attempt_count: number;
  success_rate: number;
  average_duration_seconds: number | null;
  needs_review_count: number;
  due_review_count: number;
  mastery_score: number;
}

export interface CreateAlgorithmSessionPayload {
  mode: AlgorithmTrainingMode;
  count: number;
  topics?: string[];
  difficulty?: AlgorithmDifficulty[];
  source_lists?: string[];
  problem_ids?: string[];
  exclude_solved?: boolean;
  prioritize_due_review?: boolean;
  reference_problem_id?: string;
}

export interface SaveAlgorithmAttemptPayload {
  problem_id: number;
  session_id?: string;
  duration_seconds?: number;
  result: AlgorithmAttemptResult;
  language?: string;
  approach: string;
  time_complexity?: string;
  space_complexity?: string;
  code?: string;
  reflection?: string;
  mistakes?: string;
  edge_cases?: string;
  needs_review: boolean;
}
