import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { XIcon } from "@phosphor-icons/react/X";

import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { InterviewEvaluationResult } from "../components/interview/InterviewEvaluationResult";
import { InterviewProgress } from "../components/interview/InterviewProgress";
import { InterviewQuestionPanel } from "../components/interview/InterviewQuestionPanel";
import {
  clearInterviewAnswerDraft,
  clearInterviewSessionDrafts,
  clearLastActiveInterviewSession,
  setLastActiveInterviewSession,
  useInterviewAnswerDraft,
} from "../hooks/useInterviewAnswerDraft";
import { useInterviewSession } from "../hooks/useInterviewSession";
import type { AnswerSource, InterviewAnswerSubmission, InterviewQuestionForTraining } from "../types/interview";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder} 秒`;
}

function draftSaveLabel(saveState: "idle" | "saving" | "saved" | "local_only") {
  if (saveState === "saving") return "正在保存…";
  if (saveState === "saved") return "已保存到本地";
  if (saveState === "local_only") return "仅保存在本地";
  return "";
}

function scrollQuestionToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  document.getElementById("main-content")?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

export function InterviewSessionPage() {
  const navigate = useNavigate();
  const { setId } = useParams();
  const numericSetId = Number(setId);
  const {
    questionSet,
    result,
    isLoading,
    isSubmitting,
    error,
    answerTasks,
    submit,
    skip,
    retryEvaluation,
    goTo,
    complete,
    abandon,
    next,
    dismissAnswerTask,
  } = useInterviewSession(numericSetId);
  const [answerSource, setAnswerSource] = useState<AnswerSource>("text");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [retryMode, setRetryMode] = useState(false);
  const [retryAnswerId, setRetryAnswerId] = useState<number | null>(null);
  const [retryQuestion, setRetryQuestion] = useState<InterviewQuestionForTraining | null>(null);
  const [retryAnswerText, setRetryAnswerText] = useState("");
  const [showAbandonConfirmation, setShowAbandonConfirmation] = useState(false);

  const currentItem = useMemo(
    () => questionSet?.items.find((item) => item.order_index === questionSet.current_index) ?? null,
    [questionSet],
  );
  const hasPendingItems = questionSet?.items.some((item) => item.status === "pending") ?? false;
  const isCurrentEditable = questionSet?.status === "in_progress" && currentItem?.status === "pending" && !retryMode;
  const draft = useInterviewAnswerDraft({
    setId: numericSetId,
    questionId: isCurrentEditable ? currentItem?.question.id ?? null : null,
    enabled: Boolean(isCurrentEditable),
  });
  const answerText = retryMode ? retryAnswerText : draft.value;

  useEffect(() => {
    if (!questionSet) {
      return;
    }
    if (questionSet.status === "in_progress") {
      setLastActiveInterviewSession(questionSet.id);
    } else {
      clearLastActiveInterviewSession(questionSet.id);
    }
  }, [questionSet]);

  useEffect(() => {
    if (!questionSet?.current_question || result || questionSet.status !== "in_progress") {
      return;
    }
    const timer = window.setInterval(() => setDurationSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [questionSet?.current_question, questionSet?.status, result]);

  useEffect(() => {
    if (result?.evaluation_status === "completed") {
      clearInterviewAnswerDraft(numericSetId, result.answer.question_id);
    }
  }, [numericSetId, result]);

  useEffect(() => {
    for (const task of answerTasks) {
      if (task.status === "completed") {
        clearInterviewAnswerDraft(numericSetId, task.questionId);
      }
    }
  }, [answerTasks, numericSetId]);

  useEffect(() => {
    setDurationSeconds(0);
    setAnswerSource("text");
    setRetryMode(false);
    setRetryAnswerId(null);
    setRetryQuestion(null);
    setRetryAnswerText("");
  }, [currentItem?.question.id]);

  if (!Number.isInteger(numericSetId) || numericSetId < 1) {
    return <p className="field-error page-error" role="alert">训练题集编号无效。</p>;
  }

  if (isLoading) {
    return <div className="interview-session-loading" aria-live="polite"><span /><span /><span /></div>;
  }

  if (!questionSet) {
    return <p className="field-error page-error" role="alert">{error || "训练题集不存在。"}</p>;
  }

  const historicalResult: InterviewAnswerSubmission | null = !result && currentItem?.latest_answer
    ? {
        answer: currentItem.latest_answer,
        evaluation: currentItem.latest_evaluation,
        evaluation_status: currentItem.latest_evaluation ? "completed" : currentItem.latest_answer.evaluation_status,
        evaluation_error: currentItem.latest_evaluation ? null : currentItem.latest_answer.evaluation_error ?? "这条回答尚未完成评分。",
        next_review_at: currentItem.next_review_at,
      }
    : null;
  const displayedResult = result?.evaluation_status === "processing" ? null : result ?? (historicalResult?.evaluation_status === "processing" ? null : historicalResult);
  const activeQuestion = retryMode ? retryQuestion : currentItem?.status === "pending" ? currentItem.question : null;
  const currentAnswerPendingReview = !displayedResult && currentItem?.latest_answer?.evaluation_status === "processing" && !currentItem.latest_evaluation;
  const currentPosition = questionSet.items.findIndex((item) => item.order_index === questionSet.current_index);
  const canSubmit = Boolean(answerText.trim()) && !isSubmitting;

  async function handleSubmit() {
    if (!activeQuestion) {
      return;
    }
    const wasRetrying = retryMode;
    const targetQuestionId = activeQuestion.id;
    const submittedPromise = submit(
      activeQuestion.id,
      answerText,
      answerSource,
      durationSeconds,
      retryMode ? retryAnswerId ?? undefined : undefined,
    );
    if (wasRetrying) {
      handleNext();
    }
    const submitted = await submittedPromise;
    if (submitted?.evaluation_status === "completed") {
      clearInterviewAnswerDraft(numericSetId, targetQuestionId);
    }
  }

  async function handleSkip() {
    if (!currentItem) {
      return;
    }
    draft.flush();
    if (await skip()) {
      clearInterviewAnswerDraft(numericSetId, currentItem.question.id);
    }
  }

  async function handleNavigate(index: number) {
    draft.flush();
    await goTo(index);
    scrollQuestionToTop();
  }

  function handleOpenTask(questionId: string) {
    const item = questionSet?.items.find((candidate) => candidate.question.id === questionId);
    if (item) {
      void handleNavigate(item.order_index);
    }
  }

  function handleNext() {
    next();
    scrollQuestionToTop();
    setDurationSeconds(0);
    setRetryMode(false);
    setRetryAnswerId(null);
    setRetryQuestion(null);
    setRetryAnswerText("");
  }

  function handleRetryAnswer(submission: InterviewAnswerSubmission) {
    const question = questionSet?.items.find((item) => item.question.id === submission.answer.question_id)?.question ?? null;
    if (!question) {
      return;
    }
    setRetryMode(true);
    setRetryAnswerId(submission.answer.id);
    setRetryQuestion(question);
    setRetryAnswerText(submission.answer.answer_text);
    setAnswerSource(submission.answer.answer_source);
    setDurationSeconds(submission.answer.duration_seconds ?? 0);
    next();
  }

  async function handleComplete() {
    if (await complete()) {
      clearInterviewSessionDrafts(numericSetId);
      clearLastActiveInterviewSession(numericSetId);
    }
  }

  async function handleAbandon() {
    draft.flush();
    if (await abandon()) {
      clearLastActiveInterviewSession(numericSetId);
      setShowAbandonConfirmation(false);
      navigate("/interview/history");
    }
  }

  const isReadOnly = questionSet.status !== "in_progress";

  return (
    <div className="page-stack interview-session-page">
      <header className="session-header">
        <button className="back-link focus-back-button" onClick={() => navigate("/interview")} type="button"><ArrowLeftIcon aria-hidden="true" size={17} />八股训练</button>
        <InterviewProgress questionSet={questionSet} />
      </header>

      {questionSet.availability_message ? <p className="save-notice">{questionSet.availability_message}</p> : null}
      {error ? <p className="field-error session-error" role="alert">{error}</p> : null}
      {answerTasks.length ? (
        <InterviewAnswerTaskTray
          tasks={answerTasks}
          isSubmitting={isSubmitting}
          onDismiss={dismissAnswerTask}
          onOpen={handleOpenTask}
          onRetry={(answerId) => void retryEvaluation(answerId)}
        />
      ) : null}

      {isReadOnly ? (
        <section className="interview-complete interview-session-readonly">
          <span className="pane-label">只读详情</span>
          <h2>{questionSet.status === "completed" ? "训练已归档" : "训练已放弃"}</h2>
          <p>已提交的回答、评分和复习计划会继续保留在训练历史中。</p>
          <button className="button button-primary" onClick={() => navigate("/interview/history")} type="button"><ArrowRightIcon aria-hidden="true" size={16} weight="bold" />查看训练历史</button>
        </section>
      ) : displayedResult ? (
        <div className="session-result-layout">
          <InterviewEvaluationResult result={displayedResult} />
          <div className="session-result-actions">
            {displayedResult.evaluation_status === "failed" ? <button className="button button-secondary" disabled={isSubmitting} onClick={() => void retryEvaluation(displayedResult.answer.id)} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />重新评价</button> : null}
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => handleRetryAnswer(displayedResult)} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />重新回答</button>
            {result && hasPendingItems ? <button className="button button-primary" disabled={isSubmitting} onClick={handleNext} type="button">下一题<ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></button> : null}
            {!result && currentPosition > 0 ? <button className="button button-secondary" disabled={isSubmitting} onClick={() => void handleNavigate(questionSet.items[currentPosition - 1].order_index)} type="button"><ArrowLeftIcon aria-hidden="true" size={16} weight="bold" />上一题</button> : null}
            {!result && currentPosition >= 0 && currentPosition < questionSet.items.length - 1 ? <button className="button button-primary" disabled={isSubmitting} onClick={() => void handleNavigate(questionSet.items[currentPosition + 1].order_index)} type="button">下一题<ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></button> : null}
            {!hasPendingItems ? <button className="button button-primary" disabled={isSubmitting} onClick={() => void handleComplete()} type="button"><CheckIcon aria-hidden="true" size={16} weight="bold" />结束训练</button> : null}
          </div>
        </div>
      ) : activeQuestion ? (
        <div className="session-workbench">
          <InterviewQuestionPanel
            question={activeQuestion}
            answerText={answerText}
            answerSource={answerSource}
            durationSeconds={durationSeconds}
            disabled={isSubmitting && retryMode}
            onAnswerChange={retryMode ? setRetryAnswerText : draft.setValue}
            onAnswerSourceChange={setAnswerSource}
          />
          <aside className="session-actions" aria-label="回答操作">
            <span className="pane-label">回答计时</span>
            <strong className="tabular-number">{formatDuration(durationSeconds)}</strong>
            {draft.wasRestored ? <p className="draft-recovery-notice" role="status">已恢复本地草稿</p> : null}
            {draftSaveLabel(draft.saveState) ? <span className="draft-save-state" role="status">{draftSaveLabel(draft.saveState)}</span> : null}
            <button className="button button-primary" disabled={!canSubmit} onClick={() => void handleSubmit()} type="button">
              <PlayIcon aria-hidden="true" size={16} weight="fill" />
              {isSubmitting ? "正在保存" : retryMode ? "核对新回答" : "核对回答"}
            </button>
            {retryMode ? (
              <button className="button button-secondary" disabled={isSubmitting} onClick={handleNext} type="button"><XIcon aria-hidden="true" size={16} weight="bold" />取消重答</button>
            ) : (
              <button className="button button-secondary" disabled={isSubmitting} onClick={() => void handleSkip()} type="button"><ArrowRightIcon aria-hidden="true" size={16} weight="bold" />跳过本题</button>
            )}
            <div className="session-question-navigation" aria-label="题目导航">
              <button className="button button-secondary" disabled={isSubmitting || currentPosition <= 0} onClick={() => void handleNavigate(questionSet.items[currentPosition - 1].order_index)} type="button"><ArrowLeftIcon aria-hidden="true" size={16} weight="bold" />上一题</button>
              <button className="button button-secondary" disabled={isSubmitting || currentPosition < 0 || currentPosition >= questionSet.items.length - 1} onClick={() => void handleNavigate(questionSet.items[currentPosition + 1].order_index)} type="button">下一题<ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></button>
            </div>
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => setShowAbandonConfirmation(true)} type="button"><FlagIcon aria-hidden="true" size={16} weight="bold" />放弃训练</button>
          </aside>
        </div>
      ) : currentAnswerPendingReview ? (
        <section className="interview-complete interview-processing-wait"><span className="pane-label">后台核对</span><h2>这题正在核对</h2><p>回答已经保存，结果完成后会出现在上方状态里。</p>{hasPendingItems ? <button className="button button-primary" disabled={isSubmitting} onClick={() => void handleNavigate(questionSet.items.find((item) => item.status === "pending")?.order_index ?? 0)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续下一题</button> : null}</section>
      ) : !hasPendingItems ? (
        <section className="interview-complete"><span className="pane-label">已完成全部题目</span><h2>结束训练</h2><p>确认结束后会归档本次训练，并清理对应的本地草稿。</p><button className="button button-primary" disabled={isSubmitting} onClick={() => void handleComplete()} type="button"><CheckIcon aria-hidden="true" size={16} weight="bold" />结束训练</button></section>
      ) : (
        <section className="interview-complete"><span className="pane-label">本题已跳过</span><h2>继续训练</h2><p>跳过状态已记录，不会被当作已回答。</p><button className="button button-primary" disabled={isSubmitting} onClick={() => void handleNavigate(questionSet.items.find((item) => item.status === "pending")?.order_index ?? 0)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />前往待答题</button></section>
      )}

      <ConfirmActionDialog
        confirmLabel="确认放弃"
        danger
        description="放弃后保留已经提交的回答和评分，但这次训练不能继续。"
        isConfirming={isSubmitting}
        onCancel={() => setShowAbandonConfirmation(false)}
        onConfirm={() => void handleAbandon()}
        open={showAbandonConfirmation}
        title="放弃当前训练？"
      />
    </div>
  );
}

function InterviewAnswerTaskTray({
  tasks,
  isSubmitting,
  onDismiss,
  onOpen,
  onRetry,
}: {
  tasks: Array<{
    key: string;
    questionId: string;
    questionText: string;
    answerId: number | null;
    status: "saving" | "processing" | "completed" | "failed";
    error: string | null;
  }>;
  isSubmitting: boolean;
  onDismiss: (key: string) => void;
  onOpen: (questionId: string) => void;
  onRetry: (answerId: number) => void;
}) {
  const statusLabel = {
    saving: "保存中",
    processing: "核对中",
    completed: "完成",
    failed: "失败",
  };

  return (
    <section className="interview-answer-task-tray" aria-label="回答核对状态" aria-live="polite">
      <div className="section-heading">
        <div><span className="pane-label">后台核对</span><h2>回答状态</h2></div>
        <span>{tasks.length} 条</span>
      </div>
      <div className="interview-answer-task-list">
        {tasks.map((task) => (
          <article className={`interview-answer-task interview-answer-task-${task.status}`} key={task.key}>
            <div>
              <span className="pane-label">{task.status === "saving" || task.status === "processing" ? <SpinnerGapIcon aria-hidden="true" className="interview-task-spinner" size={13} /> : null}{statusLabel[task.status]}</span>
              <h3>{task.questionText}</h3>
              {task.status === "saving" ? <p>正在确认保存，计时已经停住。</p> : null}
              {task.status === "processing" ? <p>回答已保存，正在后台核对。可以继续刷下一题。</p> : null}
              {task.status === "completed" ? <p>核对完成，结果已写入本题记录。</p> : null}
              {task.status === "failed" ? <p>{task.error ?? "核对失败，回答和用时已保留。"}</p> : null}
            </div>
            <div className="interview-answer-task-actions">
              <button className="button button-secondary" onClick={() => onOpen(task.questionId)} type="button">查看</button>
              {task.status === "failed" && task.answerId ? (
                <button className="button button-secondary" disabled={isSubmitting} onClick={() => onRetry(task.answerId!)} type="button">重新核对</button>
              ) : null}
              {task.status === "completed" || task.status === "failed" ? (
                <button className="text-danger-button" onClick={() => onDismiss(task.key)} type="button">关闭</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
