import { useCallback, useEffect, useRef, useState } from "react";

import {
  evaluateInterviewAnswer,
  getInterviewQuestionSet,
  abandonInterviewQuestionSet,
  completeInterviewQuestionSet,
  retryInterviewAnswer,
  skipInterviewQuestion,
  submitInterviewAnswer,
  updateInterviewQuestionSetProgress,
} from "../api/interviews";
import type { AnswerSource, InterviewAnswerSubmission, InterviewQuestionSet } from "../types/interview";

export function useInterviewSession(setId: number) {
  const [questionSet, setQuestionSet] = useState<InterviewQuestionSet | null>(null);
  const [result, setResult] = useState<InterviewAnswerSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError("");
    try {
      setQuestionSet(await getInterviewQuestionSet(setId, controller.signal));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "训练题集加载失败。");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [setId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  async function submit(
    questionId: string,
    answerText: string,
    answerSource: AnswerSource,
    durationSeconds: number,
    retryAnswerId?: number,
  ): Promise<InterviewAnswerSubmission | null> {
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
      return nextResult;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "回答提交失败，请稍后重试。");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function skip(): Promise<boolean> {
    setIsSubmitting(true);
    setError("");
    try {
      setQuestionSet(await skipInterviewQuestion(setId));
      setResult(null);
      return true;
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : "跳过失败，请稍后重试。");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryEvaluation(answerId?: number) {
    const targetAnswerId = answerId ?? result?.answer.id;
    if (!targetAnswerId) {
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      setResult(await evaluateInterviewAnswer(targetAnswerId));
      setQuestionSet(await getInterviewQuestionSet(setId));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重新评价失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function goTo(currentIndex: number) {
    if (!questionSet) {
      return false;
    }
    const item = questionSet.items.find((candidate) => candidate.order_index === currentIndex);
    if (!item) {
      return false;
    }
    setIsSubmitting(true);
    setError("");
    try {
      setQuestionSet(
        await updateInterviewQuestionSetProgress(setId, {
          current_index: currentIndex,
          last_active_question_id: item.question.id,
        }),
      );
      setResult(null);
      return true;
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "进度保存失败，请稍后重试。");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function complete(): Promise<boolean> {
    setIsSubmitting(true);
    setError("");
    try {
      setQuestionSet(await completeInterviewQuestionSet(setId));
      setResult(null);
      return true;
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "结束训练失败，请稍后重试。");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function abandon(): Promise<boolean> {
    setIsSubmitting(true);
    setError("");
    try {
      setQuestionSet(await abandonInterviewQuestionSet(setId));
      setResult(null);
      return true;
    } catch (abandonError) {
      setError(abandonError instanceof Error ? abandonError.message : "放弃训练失败，请稍后重试。");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  function next() {
    setResult(null);
  }

  return {
    questionSet,
    result,
    isLoading,
    isSubmitting,
    error,
    load,
    submit,
    skip,
    retryEvaluation,
    goTo,
    complete,
    abandon,
    next,
    setError,
  };
}
