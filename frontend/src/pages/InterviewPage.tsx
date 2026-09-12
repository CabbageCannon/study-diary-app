import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";

import {
  abandonInterviewQuestionSet,
  createInterviewQuestionSet,
  getInterviewTrainingStats,
  listInterviewQuestionSets,
  peekInterviewTrainingStats,
  peekInterviewQuestionSets,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { domainOptions, InterviewSetupForm } from "../components/interview/InterviewSetupForm";
import { getLastActiveInterviewSession } from "../hooks/useInterviewAnswerDraft";
import { useUserPreferences } from "../hooks/useUserPreferences";
import type { CreateQuestionSetPayload, InterviewQuestionSetSummary, InterviewTrainingStats, QuestionDomain } from "../types/interview";

const INTERVIEW_SETUP_KEY = "study-diary:interview:setup";

const initialPayload: CreateQuestionSetPayload = {
  question_count: 3,
  include_due_reviews: true,
  random_order: true,
};

function loadSavedPayload(): CreateQuestionSetPayload {
  try {
    const raw = window.localStorage.getItem(INTERVIEW_SETUP_KEY);
    if (!raw) return initialPayload;
    const saved = JSON.parse(raw) as Partial<CreateQuestionSetPayload>;
    return { ...initialPayload, ...saved, question_count: Number(saved.question_count) || initialPayload.question_count };
  } catch {
    return initialPayload;
  }
}

function savePayload(value: CreateQuestionSetPayload) {
  window.localStorage.setItem(INTERVIEW_SETUP_KEY, JSON.stringify(value));
}

function resumeLabel(summary: InterviewQuestionSetSummary) {
  return `${summary.domain ?? "综合"}${summary.topic ? ` · ${summary.topic}` : ""}`;
}

function domainLabel(domain?: QuestionDomain | null) {
  return domainOptions.find((item) => item.value === domain)?.label ?? "综合";
}

export function InterviewPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isSetup = pathname === "/interview/setup";
  const [preferences] = useUserPreferences();
  const [payload, setPayload] = useState<CreateQuestionSetPayload>(loadSavedPayload);
  const [pendingSets, setPendingSets] = useState<InterviewQuestionSetSummary[]>(() => peekInterviewQuestionSets({ status: "in_progress", limit: 12 }) ?? []);
  const [stats, setStats] = useState<InterviewTrainingStats | null>(() => peekInterviewTrainingStats() ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"restart" | "abandon" | null>(null);
  const [pendingStartPayload, setPendingStartPayload] = useState<CreateQuestionSetPayload | null>(null);
  const [savedPromptOpen, setSavedPromptOpen] = useState(false);

  const resumableSet = useMemo(() => {
    const lastSessionId = getLastActiveInterviewSession();
    return pendingSets.find((item) => item.id === lastSessionId) ?? pendingSets[0] ?? null;
  }, [pendingSets]);
  const resumableRemaining = resumableSet ? Math.max(0, resumableSet.question_count - resumableSet.answered_count - resumableSet.skipped_count) : 0;
  const dailyGoal = preferences.dailyGoals.interview;
  const todayAnswered = stats?.today_answered_count ?? 0;
  const remainingToday = Math.max(0, dailyGoal - todayAnswered);
  const dailyTitle = dailyGoal > 0
    ? remainingToday > 0 ? `今日还差 ${remainingToday} 道` : "今日八股已完成"
    : "今天没有八股指标";
  const dailyDetail = dailyGoal > 0
    ? remainingToday > 0 ? "优先安排到期复习，题量跟随今日剩余目标。" : `已完成 ${todayAnswered} / ${dailyGoal} 道。还想加练的话，继续刷会保留。`
    : "今天没有固定题量，可以直接练一组。";
  const recommendationCopy = remainingToday > 0
    ? "优先安排到期复习，题量跟随今日剩余目标。"
    : "优先安排到期复习，沿用已保存题量再练一组。";
  const recommendedCount = remainingToday > 0 ? remainingToday : payload.question_count;
  const strongestDomain = stats?.domains[0]?.domain ?? payload.domain;
  const recommendedPayload = useMemo<CreateQuestionSetPayload>(() => ({
    ...payload,
    question_count: Math.max(1, recommendedCount),
    include_due_reviews: true,
  }), [payload, recommendedCount]);
  const similarPayload = useMemo<CreateQuestionSetPayload>(() => ({
    ...recommendedPayload,
    domain: strongestDomain,
    topic: strongestDomain === payload.domain ? payload.topic : undefined,
  }), [payload.domain, payload.topic, recommendedPayload, strongestDomain]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [nextPending, nextStats] = await Promise.all([
        listInterviewQuestionSets({ status: "in_progress", limit: 12, signal: controller.signal }).catch(() => []),
        getInterviewTrainingStats(controller.signal).catch(() => null),
      ]);
      if (controller.signal.aborted) {
        return;
      }
      setPendingSets(nextPending);
      if (nextStats) setStats(nextStats);
    }
    void load();
    return () => controller.abort();
  }, []);

  async function startTraining(skipPendingConfirmation = false, nextPayload = payload) {
    if (resumableSet && !skipPendingConfirmation) {
      setPendingStartPayload(nextPayload);
      setPendingAction("restart");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const questionSet = await createInterviewQuestionSet(nextPayload);
      navigate(`/interview/session/${questionSet.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "训练题集创建失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function abandonResumableSet(): Promise<boolean> {
    if (!resumableSet) {
      return false;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await abandonInterviewQuestionSet(resumableSet.id);
      setPendingSets((current) => current.filter((item) => item.id !== resumableSet.id));
      return true;
    } catch (abandonError) {
      setError(abandonError instanceof Error ? abandonError.message : "放弃训练失败，请稍后重试。");
      return false;
    } finally {
      setIsSubmitting(false);
      setPendingAction(null);
    }
  }

  async function confirmPendingAction() {
    if (pendingAction === "abandon") {
      await abandonResumableSet();
      return;
    }
    if (await abandonResumableSet()) {
      await startTraining(true, pendingStartPayload ?? payload);
    }
  }

  function saveSetup() {
    savePayload(payload);
    setError("");
    setSavedPromptOpen(true);
  }

  return (
    <div className="interview-page interview-home-page interview-workspace-panel">
      {resumableSet ? (
        <section className="interview-resume-panel" aria-labelledby="resume-session-title">
          <div>
            <span className="pane-label">{resumableRemaining > 0 ? "未完成训练" : "待结束训练"}</span>
            <h2 id="resume-session-title">{resumableRemaining > 0 ? `还剩 ${resumableRemaining} / ${resumableSet.question_count} 题` : "本轮已答完"}</h2>
            <p>最后练习：{resumeLabel(resumableSet)}{resumableRemaining > 0 ? "" : " · 进入后结束训练"}</p>
          </div>
          <div className="interview-resume-actions">
            <button className="button button-primary" onClick={() => navigate(`/interview/session/${resumableSet.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续上次训练</button>
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => setPendingAction("restart")} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />重新开始</button>
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => setPendingAction("abandon")} type="button"><FlagIcon aria-hidden="true" size={16} weight="bold" />放弃训练</button>
          </div>
        </section>
      ) : null}

      {isSetup ? (
        <section className="interview-setup-surface" aria-labelledby="interview-setup-heading">
          <div><span className="pane-label">题集</span><h2 id="interview-setup-heading">按今天的状态调整</h2><p>选择题量、方向和难度，保存为下次默认训练。</p></div>
          <InterviewSetupForm value={payload} isSubmitting={isSubmitting} error={error} onChange={setPayload} onSave={saveSetup} />
        </section>
      ) : (
        <>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <section className="daily-feed-layout interview-daily-layout" aria-label="八股训练推荐">
            {remainingToday === 0 && dailyGoal > 0 ? (
              <section className="daily-primary-problem">
                <div className="daily-primary-heading"><span>今日八股已完成</span></div>
                <h2 id="interview-start-title">{dailyTitle}</h2>
                <p className="daily-strategy-summary">{dailyDetail}</p>
              </section>
            ) : (
              <article className="daily-primary-problem" aria-labelledby="interview-start-title">
                <div className="daily-primary-heading"><span>今日主推荐</span></div>
                <h2 id="interview-start-title">{dailyTitle}</h2>
                <p className="daily-problem-original-title">按今日目标练</p>
                <p className="daily-strategy-summary">{recommendationCopy}</p>
                <div className="daily-problem-state">
                  {dailyGoal > 0 ? <span>今日还剩 {remainingToday} 道</span> : null}
                  <span>{domainLabel(recommendedPayload.domain)}方向</span>
                  <span>{Math.max(1, recommendedCount)} 道题</span>
                </div>
                <div className="daily-primary-actions">
                  <button className="button button-primary" disabled={isSubmitting} onClick={() => void startTraining(false, recommendedPayload)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />{isSubmitting ? "正在创建" : `练 ${Math.max(1, recommendedCount)} 道`}</button>
                </div>
              </article>
            )}
            <aside className="daily-continuation-panel" aria-labelledby="interview-continuation-title">
              <h2 id="interview-continuation-title">继续刷</h2>
              <div className="interview-practice-options">
                <article>
                  <div><span>同类练习</span><h3>{domainLabel(strongestDomain)}方向</h3><p>沿用常练方向和已保存偏好，适合加深同一类问题。</p></div>
                  <button className="button button-secondary" disabled={isSubmitting} onClick={() => void startTraining(false, similarPayload)} type="button">开始同类练习</button>
                </article>
                <article>
                  <div><span>指定偏好</span><h3>调整题集</h3><p>选择题量、方向和难度，保存为下次默认训练。</p></div>
                  <Link className="button button-secondary" to="/interview/setup">打开题集设置</Link>
                </article>
              </div>
            </aside>
          </section>
        </>
      )}

      <ConfirmActionDialog
        confirmLabel={pendingAction === "restart" ? "放弃并开始新训练" : "确认放弃"}
        danger
        description={pendingAction === "restart" ? "当前未完成训练会保留在历史中并标记为已放弃，新的训练将使用当前配置重新创建。" : "放弃后仍可在训练历史中查看已有回答，但不能继续本次训练。"}
        isConfirming={isSubmitting}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
        open={pendingAction !== null}
        title={pendingAction === "restart" ? "开始新的训练？" : "放弃当前训练？"}
      />
      <ConfirmActionDialog
        cancelLabel="稍后再说"
        confirmLabel="立刻训练"
        description="题量、方向和难度已经保存到本机，下次进入八股训练会继续使用。"
        isConfirming={isSubmitting}
        onCancel={() => setSavedPromptOpen(false)}
        onConfirm={() => {
          setSavedPromptOpen(false);
          void startTraining(false, payload);
        }}
        open={savedPromptOpen}
        title="题集已保存"
      />
    </div>
  );
}
