import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";
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
    submit,
    skip,
    retryEvaluation,
    goTo,
    complete,
    abandon,
    next,
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

  const historicalResult: InterviewAnswerSubmission | null = !result && hasPendingItems && currentItem?.latest_answer
    ? {
        answer: currentItem.latest_answer,
        evaluation: currentItem.latest_evaluation,
        evaluation_status: currentItem.latest_evaluation ? "completed" : "failed",
        evaluation_error: currentItem.latest_evaluation ? null : "这条回答尚未完成评分。",
        next_review_at: currentItem.next_review_at,
      }
    : null;
  const displayedResult = result ?? historicalResult;
  const activeQuestion = retryMode ? retryQuestion : currentItem?.status === "pending" ? currentItem.question : null;
  const currentPosition = questionSet.items.findIndex((item) => item.order_index === questionSet.current_index);
  const canSubmit = Boolean(answerText.trim()) && !isSubmitting;

  async function handleSubmit() {
    if (!activeQuestion) {
      return;
    }
    const submitted = await submit(
      activeQuestion.id,
      answerText,
      answerSource,
      durationSeconds,
      retryMode ? retryAnswerId ?? undefined : undefined,
    );
    if (submitted) {
      clearInterviewAnswerDraft(numericSetId, activeQuestion.id);
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
  }

  function handleNext() {
    next();
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
        <div><span className="page-kicker">训练会话</span><h1>{isReadOnly ? (questionSet.status === "completed" ? "训练已完成" : "训练已放弃") : "训练会话"}</h1></div>
        <InterviewProgress questionSet={questionSet} />
      </header>

      {questionSet.availability_message ? <p className="save-notice">{questionSet.availability_message}</p> : null}
      {error ? <p className="field-error session-error" role="alert">{error}</p> : null}

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
            disabled={isSubmitting}
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
              {isSubmitting ? "正在评分..." : retryMode ? "提交新版本" : "提交回答"}
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
