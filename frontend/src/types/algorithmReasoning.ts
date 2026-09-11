export type AlgorithmReasoningSaveStatus = "saved" | "save_failed";
export type AlgorithmReasoningCheckStatus = "not_attempted" | "completed" | "failed" | "context_unavailable";
export type AlgorithmReasoningConclusion = "correct" | "partially_correct" | "critical_error" | "insufficient_context";
export type AlgorithmReasoningIssueType = "key_error" | "missing" | "unclear";
export type AlgorithmReasoningAnswerSource = "text" | "voice";

export interface AlgorithmReasoningDetails {
  time_complexity: string | null;
  space_complexity: string | null;
  code: string | null;
  notes: string | null;
}

export interface AlgorithmReasoningAnswer {
  answer_id: number;
  problem_id: string;
  session_id: string | null;
  version: number;
  revision_of_answer_id: number | null;
  answer_text: string;
  answer_source: AlgorithmReasoningAnswerSource;
  details: AlgorithmReasoningDetails;
  client_answer_id: string;
  save_status: AlgorithmReasoningSaveStatus;
  check_status: AlgorithmReasoningCheckStatus;
  saved_at: string;
  checked_at: string | null;
}

export interface AlgorithmReasoningFeedbackPoint {
  point: string;
  quote: string | null;
}

export interface AlgorithmReasoningIssue {
  type: AlgorithmReasoningIssueType;
  detail: string;
  quote: string | null;
  verification_point_id: string | null;
}

export interface AlgorithmReasoningFollowup {
  kind: "counterexample" | "followup" | "none";
  content: string | null;
}

export interface AlgorithmReasoningComplexityItem {
  user_claim: string | null;
  assessment: "correct" | "incorrect" | "partially_correct" | "not_stated";
  expected: string | null;
  note: string | null;
}

export interface AlgorithmReasoningFeedback {
  feedback_id: number;
  answer_id: number;
  conclusion: AlgorithmReasoningConclusion;
  headline: string;
  context_sufficient: boolean;
  accuracy_score: number;
  correct_parts: AlgorithmReasoningFeedbackPoint[];
  issues_or_missing: AlgorithmReasoningIssue[];
  counterexample_or_followup: AlgorithmReasoningFollowup;
  complexity: {
    time: AlgorithmReasoningComplexityItem;
    space: AlgorithmReasoningComplexityItem;
  };
  alternative_approaches_accepted: string[];
  reference_outline: string;
  needs_review: boolean;
  model_name: string;
  prompt_version: string;
  context_version: number;
  created_at: string;
}

export interface AlgorithmReasoningRetry {
  check_url: string;
  method: "POST";
}

export interface AlgorithmReasoningProblemContextSummary {
  problem_id: string;
  content_version: number | null;
  reasoning_available: boolean;
}

export interface AlgorithmReasoningCheckResponse {
  save_status: AlgorithmReasoningSaveStatus;
  check_status: AlgorithmReasoningCheckStatus;
  answer: AlgorithmReasoningAnswer | null;
  feedback: AlgorithmReasoningFeedback | null;
  save_error: string | null;
  check_error: string | null;
  retry: AlgorithmReasoningRetry | null;
  problem_context: AlgorithmReasoningProblemContextSummary | null;
}

export interface AlgorithmReasoningExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface AlgorithmReasoningProblemContext {
  schema_version: number;
  problem_key: string;
  title: string;
  title_zh: string;
  statement_zh: string;
  input_output: {
    input: string;
    output: string;
  };
  constraints: string[];
  examples: AlgorithmReasoningExample[];
  source: {
    name: string;
    url: string;
    license_note: string;
    source_version: string;
  };
  content_status: "draft" | "ready";
  content_version?: number;
}

export interface AlgorithmReasoningContextResponse {
  problem_id: string;
  reasoning_available: boolean;
  context: AlgorithmReasoningProblemContext | null;
}

export interface AlgorithmReasoningCheckPayload {
  problem_id: string;
  session_id: string | null;
  answer_text: string;
  answer_source: AlgorithmReasoningAnswerSource;
  details: AlgorithmReasoningDetails;
  client_answer_id: string;
  revision_of_answer_id: number | null;
}
