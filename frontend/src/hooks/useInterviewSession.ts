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

export type InterviewAnswerTaskStatus = "saving" | "processing" | "completed" | "failed";

export interface InterviewAnswerTask {
  key: string;
  questionId: string;
  questionText: string;
  answerId: number | null;
  status: InterviewAnswerTaskStatus;
  error: string | null;
}

function submissionForAnswer(questionSet: InterviewQuestionSet, answerId: number): InterviewAnswerSubmission | null {
  for (const item of questionSet.items) {
    if (item.latest_answer?.id !== answerId) continue;
    return {
      answer: item.latest_answer,
      evaluation: item.latest_evaluation,
      evaluation_status: item.latest_evaluation ? "completed" : item.latest_answer.evaluation_status,
      evaluation_error: item.latest_evaluation ? null : item.latest_answer.evaluation_error,
      next_review_at: item.next_review_at,
    };
  }
  return null;
}

function taskFromSubmission(
  submission: InterviewAnswerSubmission,
  task: Pick<InterviewAnswerTask, "key" | "questionText">,
): InterviewAnswerTask {
  return {
    key: task.key,
    questionId: submission.answer.question_id,
    questionText: task.questionText,
    answerId: submission.answer.id,
    status: submission.evaluation_status,
    error: submission.evaluation_error,
  };
}

export function useInterviewSession(setId: number) {
  const [questionSet, setQuestionSet] = useState<InterviewQuestionSet | null>(null);
  const [result, setResult] = useState<InterviewAnswerSubmission | null>(null);
  const [answerTasks, setAnswerTasks] = useState<InterviewAnswerTask[]>([]);
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

  function updateAnswerTask(nextTask: InterviewAnswerTask) {
    setAnswerTasks((tasks) => {
      const existingIndex = tasks.findIndex((task) => (
        task.key === nextTask.key || (task.answerId !== null && task.answerId === nextTask.answerId)
      ));
      if (existingIndex === -1) return [nextTask, ...tasks].slice(0, 5);
      return tasks.map((task, index) => index === existingIndex ? nextTask : task);
    });
  }

  function syncAnswerTasks(updatedQuestionSet: InterviewQuestionSet) {
    setAnswerTasks((tasks) => tasks.map((task) => {
      if (task.answerId === null) return task;
      const nextSubmission = submissionForAnswer(updatedQuestionSet, task.answerId);
      return nextSubmission ? taskFromSubmission(nextSubmission, task) : task;
    }));
  }

  function advanceQuestionSetLocally(questionId: string) {
    setResult(null);
    setQuestionSet((current) => {
      if (!current || current.status !== "in_progress") return current;
      const items = current.items.map((item) => (
        item.question.id === questionId && item.status === "pending"
          ? { ...item, status: "answered" as const }
          : item
      ));
      const nextItem = items.find((item) => item.status === "pending") ?? null;
      return {
        ...current,
        items,
        current_index: nextItem?.order_index ?? current.current_index,
        current_question: nextItem?.question ?? current.current_question,
      };
    });
  }

  const hasProcessingAnswer = questionSet?.items.some(
    (item) => item.latest_answer?.evaluation_status === "processing" && !item.latest_evaluation,
  ) ?? false;
  const hasProcessingTask = answerTasks.some((task) => task.status === "processing");

  useEffect(() => {
    if (!hasProcessingAnswer && !hasProcessingTask && result?.evaluation_status !== "processing") {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const updated = await getInterviewQuestionSet(setId);
          if (cancelled) return;
          setQuestionSet(updated);
          syncAnswerTasks(updated);
          if (result?.evaluation_status === "processing") {
            const nextResult = submissionForAnswer(updated, result.answer.id);
            if (nextResult && nextResult.evaluation_status !== "processing") {
              setResult(nextResult);
            }
          }
        } catch {
          // Keep the saved pending result visible; explicit reload can recover later.
        }
      })();
    }, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasProcessingAnswer, hasProcessingTask, result?.answer.id, result?.evaluation_status, setId]);

  async function submit(
    questionId: string,
    answerText: string,
    answerSource: AnswerSource,
    durationSeconds: number,
    retryAnswerId?: number,
  ): Promise<InterviewAnswerSubmission | null> {
    const questionText = questionSet?.items.find((item) => item.question.id === questionId)?.question.question ?? "这道题";
    const taskKey = `${questionId}:${Date.now()}`;
    updateAnswerTask({
      key: taskKey,
      questionId,
      questionText,
      answerId: null,
      status: "saving",
      error: null,
    });
    if (!retryAnswerId) {
      advanceQuestionSetLocally(questionId);
    }
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
      updateAnswerTask(taskFromSubmission(nextResult, { key: taskKey, questionText }));
      const updated = await getInterviewQuestionSet(setId);
      setQuestionSet(updated);
      syncAnswerTasks(updated);
      return nextResult;
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "回答提交失败，请稍后重试。";
      updateAnswerTask({
        key: taskKey,
        questionId,
        questionText,
        answerId: null,
        status: "failed",
        error: message,
      });
      setError(message);
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
      setAnswerTasks((tasks) => tasks.map((task) => (
        task.answerId === targetAnswerId ? { ...task, status: "processing", error: null } : task
      )));
      const nextResult = await evaluateInterviewAnswer(targetAnswerId);
      const questionText = questionSet?.items.find((item) => item.question.id === nextResult.answer.question_id)?.question.question ?? "这道题";
      updateAnswerTask(taskFromSubmission(nextResult, { key: `retry:${targetAnswerId}`, questionText }));
      const updated = await getInterviewQuestionSet(setId);
      setQuestionSet(updated);
      syncAnswerTasks(updated);
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

  function dismissAnswerTask(key: string) {
    setAnswerTasks((tasks) => tasks.filter((task) => task.key !== key));
  }

  return {
    questionSet,
    result,
    answerTasks,
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
    dismissAnswerTask,
    setError,
  };
}
