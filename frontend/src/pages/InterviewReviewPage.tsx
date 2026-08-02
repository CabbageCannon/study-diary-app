import { useCallback, useEffect, useMemo, useState } from "react";

import { listInterviewQuestions, reviewInterviewQuestion } from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { domainOptions } from "../components/interview/InterviewSetupForm";
import { InterviewReviewEditor, toReviewPayload } from "../components/interview/InterviewReviewEditor";
import type { Difficulty, InterviewQuestion, QuestionDomain, ReviewStatus } from "../types/interview";

interface ReviewFilters {
  domain: QuestionDomain | "";
  topic: string;
  difficulty: Difficulty | "";
  reviewStatus: ReviewStatus;
  search: string;
}

const initialFilters: ReviewFilters = { domain: "", topic: "", difficulty: "", reviewStatus: "pending", search: "" };

type PendingAction =
  | { kind: "discard"; nextQuestion: InterviewQuestion }
  | { kind: "status"; status: ReviewStatus };

export function InterviewReviewPage() {
  const [filters, setFilters] = useState<ReviewFilters>(initialFilters);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [selected, setSelected] = useState<InterviewQuestion | null>(null);
  const [draft, setDraft] = useState<InterviewQuestion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listInterviewQuestions({
        domain: filters.domain || undefined,
        topic: filters.topic || undefined,
        difficulty: filters.difficulty || undefined,
        reviewStatus: filters.reviewStatus,
      });
      setQuestions(data);
      setSelected((current) => data.find((item) => item.id === current?.id) ?? data[0] ?? null);
      setDraft((current) => data.find((item) => item.id === current?.id) ?? data[0] ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "审核题目加载失败。");
      setQuestions([]);
      setSelected(null);
      setDraft(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters.domain, filters.difficulty, filters.reviewStatus, filters.topic]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const visibleQuestions = useMemo(() => {
    const keyword = filters.search.trim().toLowerCase();
    if (!keyword) {
      return questions;
    }
    return questions.filter((question) => `${question.id} ${question.question} ${question.topic}`.toLowerCase().includes(keyword));
  }, [filters.search, questions]);

  const isDirty = Boolean(selected && draft && JSON.stringify(toReviewPayload(selected)) !== JSON.stringify(toReviewPayload(draft)));

  function applySelection(question: InterviewQuestion) {
    setSelected(question);
    setDraft(question);
    setError("");
  }

  function selectQuestion(question: InterviewQuestion) {
    if (question.id === selected?.id) {
      return;
    }
    if (isDirty) {
      setPendingAction({ kind: "discard", nextQuestion: question });
      return;
    }
    applySelection(question);
  }

  async function saveReview(status?: ReviewStatus) {
    if (!draft) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const updated = await reviewInterviewQuestion(draft.id, toReviewPayload(draft, status));
      setQuestions((current) => current.map((question) => question.id === updated.id ? updated : question));
      setSelected(updated);
      setDraft(updated);
      setPendingAction(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "审核结果保存失败。");
      setPendingAction(null);
    } finally {
      setIsSaving(false);
    }
  }

  const dialog = pendingAction?.kind === "discard"
    ? { title: "放弃未保存修改？", description: "切换题目后，当前修改不会保存。", confirmLabel: "放弃修改", danger: true }
    : pendingAction?.status === "verified"
      ? { title: "确认标记为 verified？", description: "这道题会进入正式训练题池，请确认来源、要点和评分规则都已人工检查。", confirmLabel: "确认通过", danger: false }
      : pendingAction?.status === "rejected"
        ? { title: "确认标记为 rejected？", description: "被拒绝的题目不会进入正式训练题池。", confirmLabel: "确认拒绝", danger: true }
        : null;

  return (
    <div className="page-stack review-page">
      <header className="page-header"><div><span className="page-kicker">开发审核</span><h1>逐题确认训练题库</h1></div><p>自动检查只能提供参考。只有你手动确认、且质量评分达标的题目，才能进入正式训练。</p></header>
      <div className="review-workbench">
        <aside className="review-list-panel" aria-label="待审核题目">
          <div className="review-filters">
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="搜索题目" aria-label="搜索题目" />
            <select value={filters.reviewStatus} onChange={(event) => setFilters({ ...filters, reviewStatus: event.target.value as ReviewStatus })}><option value="pending">pending</option><option value="verified">verified</option><option value="rejected">rejected</option></select>
            <select value={filters.domain} onChange={(event) => setFilters({ ...filters, domain: event.target.value as QuestionDomain | "" })}><option value="">全部方向</option>{domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <input value={filters.topic} onChange={(event) => setFilters({ ...filters, topic: event.target.value })} placeholder="主题 key" aria-label="按主题筛选" />
            <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value as Difficulty | "" })}><option value="">全部难度</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select>
          </div>
          <div className="review-list-header"><strong>题目列表</strong><span className="tabular-number">{isLoading ? "读取中" : visibleQuestions.length}</span></div>
          <div className="review-question-list">
            {visibleQuestions.map((question) => <button className={question.id === selected?.id ? "review-question-item review-question-item-active" : "review-question-item"} key={question.id} onClick={() => selectQuestion(question)} type="button"><span>{question.domain} · {question.difficulty}</span><strong>{question.question}</strong><small>{question.topic} · {question.review_status}</small></button>)}
          </div>
          {!isLoading && visibleQuestions.length === 0 ? <div className="empty-state"><p>当前筛选没有题目。</p></div> : null}
        </aside>
        <main className="review-main-panel">
          {draft ? <InterviewReviewEditor draft={draft} isSaving={isSaving} error={error} onChange={setDraft} onSave={() => void saveReview()} onRequestStatus={(status) => setPendingAction({ kind: "status", status })} /> : <div className="empty-state"><p>{error || "选择左侧的一道题开始审核。"}</p></div>}
        </main>
      </div>
      {dialog ? <ConfirmActionDialog open title={dialog.title} description={dialog.description} confirmLabel={dialog.confirmLabel} danger={dialog.danger} isConfirming={isSaving} onCancel={() => setPendingAction(null)} onConfirm={() => { if (pendingAction?.kind === "discard") { applySelection(pendingAction.nextQuestion); setPendingAction(null); } else if (pendingAction?.kind === "status") { void saveReview(pendingAction.status); } }} /> : null}
    </div>
  );
}
