import { useCallback, useEffect, useState } from "react";

import {
  evaluateInterviewAnswer,
  getInterviewQuestionSet,
  retryInterviewAnswer,
  skipInterviewQuestion,
  submitInterviewAnswer,
} from "../api/interviews";
import type { AnswerSource, InterviewAnswerSubmission, InterviewQuestionSet } from "../types/interview";

export function useInterviewSession(setId: number) {
  const [questionSet, setQuestionSet] = useState<InterviewQuestionSet | null>(null);
  const [result, setResult] = useState<InterviewAnswerSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setQuestionSet(await getInterviewQuestionSet(setId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练题集加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(
    questionId: string,
    answerText: string,
    answerSource: AnswerSource,
    durationSeconds: number,
    retryAnswerId?: number,
  ) {
    setIsSubmitting(true);
    setError("");
    try {
      const payload = {
        question_id: questionId,
        answer_text: answerText,
        answer_source: answerSource,
        duration_seconds: durationSeconds,
      };
      const nextResult = retryAnswerId
        ? await retryInterviewAnswer(retryAnswerId, payload)
        : await submitInterviewAnswer(setId, payload);
      setResult(nextResult);
      setQuestionSet(await getInterviewQuestionSet(setId));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "回答提交失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function skip() {
    setIsSubmitting(true);
    setError("");
    try {
      setQuestionSet(await skipInterviewQuestion(setId));
      setResult(null);
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : "跳过失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryEvaluation() {
    if (!result) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      setResult(await evaluateInterviewAnswer(result.answer.id));
      setQuestionSet(await getInterviewQuestionSet(setId));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重新评价失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function next() {
    setResult(null);
  }

  return { questionSet, result, isLoading, isSubmitting, error, load, submit, skip, retryEvaluation, next, setError };
}
