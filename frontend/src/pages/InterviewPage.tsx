import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";

import {
  abandonInterviewQuestionSet,
  createInterviewQuestionSet,
  getInterviewTrainingStats,
  listDueInterviewReviews,
  listInterviewQuestionSets,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { InterviewSetupForm } from "../components/interview/InterviewSetupForm";
import { getLastActiveInterviewSession } from "../hooks/useInterviewAnswerDraft";
import type { CreateQuestionSetPayload, InterviewQuestionSetSummary, InterviewTrainingStats } from "../types/interview";

const initialPayload: CreateQuestionSetPayload = {
  question_count: 5,
  include_due_reviews: true,
  random_order: true,
};

function resumeLabel(summary: InterviewQuestionSetSummary) {
  return `${summary.domain ?? "综合"}${summary.topic ? ` · ${summary.topic}` : ""}`;
}

export function InterviewPage() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<CreateQuestionSetPayload>(initialPayload);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [stats, setStats] = useState<InterviewTrainingStats | null>(null);
  const [pendingSets, setPendingSets] = useState<InterviewQuestionSetSummary[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"restart" | "abandon" | null>(null);

  const resumableSet = useMemo(() => {
    const lastSessionId = getLastActiveInterviewSession();
    return pendingSets.find((item) => item.id === lastSessionId) ?? pendingSets[0] ?? null;
  }, [pendingSets]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [reviews, nextStats, nextPending] = await Promise.allSettled([
        listDueInterviewReviews(),
        getInterviewTrainingStats(controller.signal),
        listInterviewQuestionSets({ status: "in_progress", limit: 12, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) {
        return;
      }
      setDueCount(reviews.status === "fulfilled" ? reviews.value.length : null);
      setStats(nextStats.status === "fulfilled" ? nextStats.value : null);
      setPendingSets(nextPending.status === "fulfilled" ? nextPending.value : []);
    }
    void load();
    return () => controller.abort();
  }, []);

  async function startTraining(skipPendingConfirmation = false) {
    if (resumableSet && !skipPendingConfirmation) {
      setPendingAction("restart");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const questionSet = await createInterviewQuestionSet(payload);
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
      await startTraining(true);
    }
  }

  return (
    <div className="page-stack interview-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">八股训练</span>
          <h1>八股训练</h1>
        </div>
        <p>
          {stats ? `连续 ${stats.streak_days} 天 · 今日 ${stats.today_answered_count} 题 · 待复习 ${stats.due_review_count} 题` : "训练状态正在同步"}
        </p>
      </header>

      {resumableSet ? (
        <section className="interview-resume-panel" aria-labelledby="resume-session-title">
          <div>
            <span className="pane-label">未完成训练</span>
            <h2 id="resume-session-title">还剩 {resumableSet.question_count - resumableSet.answered_count - resumableSet.skipped_count} / {resumableSet.question_count} 题</h2>
            <p>最后练习：{resumeLabel(resumableSet)}</p>
          </div>
          <div className="interview-resume-actions">
            <button className="button button-primary" onClick={() => navigate(`/interview/session/${resumableSet.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续上次训练</button>
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => setPendingAction("restart")} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />重新开始</button>
            <button className="button button-secondary" disabled={isSubmitting} onClick={() => setPendingAction("abandon")} type="button"><FlagIcon aria-hidden="true" size={16} weight="bold" />放弃训练</button>
          </div>
        </section>
      ) : null}

      <div className="interview-setup-layout">
        <InterviewSetupForm value={payload} isSubmitting={isSubmitting} error={error} onChange={setPayload} onSubmit={() => void startTraining()} />
        <aside className="interview-context" aria-label="训练统计">
          <span className="pane-label">学习状态</span>
          <strong className="tabular-number">{dueCount ?? "—"}</strong>
          <p>道题当前到期。累计完成 {stats?.total_answered_count ?? "—"} 题，最近平均分 {stats?.recent_average_score ?? "—"}。</p>
          {stats?.domains.length ? <div className="interview-domain-summary">{stats.domains.map((item) => <span key={item.domain}>{item.domain} {item.answered_count} 题</span>)}</div> : null}
        </aside>
      </div>

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
    </div>
  );
}
