import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { InterviewEvaluationResult } from "../components/interview/InterviewEvaluationResult";
import { InterviewProgress } from "../components/interview/InterviewProgress";
import { InterviewQuestionPanel } from "../components/interview/InterviewQuestionPanel";
import { useInterviewSession } from "../hooks/useInterviewSession";
import type { AnswerSource, InterviewQuestionForTraining } from "../types/interview";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${remainder} 秒`;
}

export function InterviewSessionPage() {
  const navigate = useNavigate();
  const { setId } = useParams();
  const numericSetId = Number(setId);
  const { questionSet, result, isLoading, isSubmitting, error, submit, skip, retryEvaluation, next } = useInterviewSession(numericSetId);
  const [answerText, setAnswerText] = useState("");
  const [answerSource, setAnswerSource] = useState<AnswerSource>("text");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [retryMode, setRetryMode] = useState(false);
  const [retryAnswerId, setRetryAnswerId] = useState<number | null>(null);
  const [retryQuestion, setRetryQuestion] = useState<InterviewQuestionForTraining | null>(null);

  useEffect(() => {
    if (!questionSet?.current_question || result) {
      return;
    }
    const timer = window.setInterval(() => setDurationSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [questionSet?.current_question, result]);

  useEffect(() => {
    setDurationSeconds(0);
    setRetryMode(false);
    setRetryAnswerId(null);
    setRetryQuestion(null);
  }, [questionSet?.current_question?.id]);

  if (!Number.isInteger(numericSetId) || numericSetId < 1) {
    return <p className="field-error page-error" role="alert">训练题集编号无效。</p>;
  }

  if (isLoading) {
    return <div className="interview-session-loading" aria-live="polite"><span /><span /><span /></div>;
  }

  if (!questionSet) {
    return <p className="field-error page-error" role="alert">{error || "训练题集不存在。"}</p>;
  }

  const currentQuestion = questionSet.current_question;
  const questionSetItems = questionSet.items;
  const activeQuestion = currentQuestion ?? retryQuestion;
  const canSubmit = Boolean(answerText.trim()) && !isSubmitting;

  function handleNext() {
    next();
    setAnswerText("");
    setAnswerSource("text");
    setDurationSeconds(0);
    setRetryQuestion(null);
  }

  function handleRetryAnswer() {
    if (!result) {
      return;
    }
    setAnswerText(result.answer.answer_text);
    setAnswerSource(result.answer.answer_source);
    setDurationSeconds(result.answer.duration_seconds ?? 0);
    setRetryMode(true);
    setRetryAnswerId(result.answer.id);
    setRetryQuestion(questionSetItems.find((item) => item.question.id === result.answer.question_id)?.question ?? null);
    next();
  }

  return (
    <div className="page-stack interview-session-page">
      <header className="session-header">
        <div><span className="page-kicker">训练会话</span><h1>{questionSet.status === "completed" ? "本次训练已完成" : "专注回答这一题"}</h1></div>
        <InterviewProgress questionSet={questionSet} />
      </header>

      {questionSet.availability_message ? <p className="save-notice">{questionSet.availability_message}</p> : null}
      {error ? <p className="field-error session-error" role="alert">{error}</p> : null}

      {result ? (
        <div className="session-result-layout">
          <InterviewEvaluationResult result={result} />
          <div className="session-result-actions">
            {result.evaluation_status === "failed" ? <button className="button button-secondary" disabled={isSubmitting} onClick={() => void retryEvaluation()} type="button">重新评价</button> : null}
            <button className="button button-secondary" disabled={isSubmitting} onClick={handleRetryAnswer} type="button">重新回答</button>
            {questionSet.current_question ? <button className="button button-primary" disabled={isSubmitting} onClick={handleNext} type="button">下一题</button> : <button className="button button-primary" onClick={() => navigate("/interview/history")} type="button">结束训练</button>}
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
            onAnswerChange={setAnswerText}
            onAnswerSourceChange={setAnswerSource}
          />
          <aside className="session-actions" aria-label="回答操作">
            <span className="pane-label">回答计时</span>
            <strong className="tabular-number">{formatDuration(durationSeconds)}</strong>
            <p>语音转写结束后可以继续编辑；只有确认文字后才会发送到评分服务。</p>
            <button className="button button-primary" disabled={!canSubmit} onClick={() => void submit(activeQuestion.id, answerText, answerSource, durationSeconds, retryMode ? retryAnswerId ?? undefined : undefined)} type="button">
              {isSubmitting ? "正在评分..." : retryMode ? "提交新版本" : "提交回答"}
            </button>
            {retryMode ? (
              <button className="button button-secondary" disabled={isSubmitting} onClick={handleNext} type="button">取消重答</button>
            ) : (
              <button className="button button-secondary" disabled={isSubmitting} onClick={() => void skip()} type="button">跳过本题</button>
            )}
          </aside>
        </div>
      ) : (
        <section className="interview-complete"><span className="pane-label">已完成</span><h2>这组题已经没有待回答项</h2><p>可以到训练历史回看答案、评分和下次复习时间。</p><button className="button button-primary" onClick={() => navigate("/interview/history")} type="button">查看训练历史</button></section>
      )}
    </div>
  );
}
