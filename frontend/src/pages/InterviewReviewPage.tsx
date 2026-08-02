import { useCallback, useEffect, useMemo, useState } from "react";

import {
  aiReviewInterviewQuestion,
  applyAiInterviewReview,
  batchAiReviewInterviewQuestions,
  listInterviewQuestions,
  quickPublishInterviewQuestions,
  rejectInterviewQuestions,
  reviewInterviewQuestion,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { domainOptions } from "../components/interview/InterviewSetupForm";
import { InterviewReviewEditor, toReviewPayload } from "../components/interview/InterviewReviewEditor";
import type { Difficulty, InterviewQuestion, QuestionDomain, ReviewStatus } from "../types/interview";

const aiReviewEnabled = import.meta.env.VITE_ENABLE_AI_QUESTION_REVIEW === "true";
const quickPublishEnabled = import.meta.env.VITE_ENABLE_QUESTION_QUICK_PUBLISH === "true";

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
  | { kind: "status"; status: ReviewStatus }
  | { kind: "quick-current" }
  | { kind: "batch-ai" }
  | { kind: "batch-quick" }
  | { kind: "batch-reject" };

function reviewMethodLabel(value: InterviewQuestion["review_method"]) {
  return value === "human" ? "人工" : value === "ai_auto" ? "AI" : value === "manual_override" ? "快速" : "未审";
}

export function InterviewReviewPage() {
  const [filters, setFilters] = useState<ReviewFilters>(initialFilters);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [selected, setSelected] = useState<InterviewQuestion | null>(null);
  const [draft, setDraft] = useState<InterviewQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    if (!keyword) return questions;
    return questions.filter((question) => `${question.id} ${question.question} ${question.topic}`.toLowerCase().includes(keyword));
  }, [filters.search, questions]);

  useEffect(() => {
    const available = new Set(questions.map((question) => question.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [questions]);

  const isDirty = Boolean(selected && draft && JSON.stringify(toReviewPayload(selected)) !== JSON.stringify(toReviewPayload(draft)));

  function applyQuestion(question: InterviewQuestion) {
    setQuestions((current) => current.map((item) => item.id === question.id ? question : item));
    setSelected(question);
    setDraft(question);
  }

  function selectQuestion(question: InterviewQuestion) {
    if (question.id === selected?.id) return;
    if (isDirty) {
      setPendingAction({ kind: "discard", nextQuestion: question });
      return;
    }
    applyQuestion(question);
    setError("");
    setNotice("");
  }

  function toggleSelected(questionId: string) {
    setSelectedIds((current) => current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]);
  }

  async function saveReview(status?: ReviewStatus) {
    if (!draft) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await reviewInterviewQuestion(draft.id, toReviewPayload(draft, status));
      applyQuestion(updated);
      setNotice(status === "verified" ? "已按人工精审通过并加入训练池。" : status === "rejected" ? "题目已标记为 rejected。" : "修改已保存。");
      setPendingAction(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "审核结果保存失败。");
      setPendingAction(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function runAiReview() {
    if (!draft) return;
    setIsSaving(true);
    setError("");
    try {
      const result = await aiReviewInterviewQuestion(draft.id);
      applyQuestion(result.question);
      setNotice("AI 审核已完成，结果已保存，等待你决定是否采用建议。");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "AI 审核失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function applyAiReview() {
    if (!draft) return;
    setIsSaving(true);
    setError("");
    try {
      const result = await applyAiInterviewReview(draft.id);
      applyQuestion(result.question);
      setNotice(result.published ? "已采用 AI 建议并加入训练池。" : "AI 建议未满足正式化规则，题目保持待审核。");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "采用 AI 建议失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function quickPublishCurrent() {
    if (!draft) return;
    setIsSaving(true);
    try {
      const result = await quickPublishInterviewQuestions([draft.id]);
      setNotice(result.published ? "题目已通过快速正式化进入训练池。" : result.items[0]?.message ?? "没有题目被正式化。");
      setPendingAction(null);
      await loadQuestions();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "快速正式化失败。");
      setPendingAction(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function runBatch(kind: "ai" | "quick" | "reject") {
    if (!selectedIds.length) return;
    setIsSaving(true);
    setError("");
    try {
      const result = kind === "ai"
        ? await batchAiReviewInterviewQuestions(selectedIds)
        : kind === "quick"
          ? await quickPublishInterviewQuestions(selectedIds)
          : await rejectInterviewQuestions(selectedIds);
      setNotice(kind === "reject"
        ? `已处理 ${result.total} 道：拒绝 ${result.reviewed}，失败 ${result.failed}，跳过 ${result.skipped}。`
        : `已处理 ${result.total} 道：正式化 ${result.published}，保持待审核 ${result.kept_pending}，失败 ${result.failed}，跳过 ${result.skipped}。`);
      setPendingAction(null);
      setSelectedIds([]);
      await loadQuestions();
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "批量处理失败。");
      setPendingAction(null);
    } finally {
      setIsSaving(false);
    }
  }

  const dialog = pendingAction?.kind === "discard"
    ? { title: "放弃未保存修改？", description: "切换题目后，当前修改不会保存。", confirmLabel: "放弃修改", danger: true }
    : pendingAction?.kind === "status" && pendingAction.status === "verified"
      ? { title: "确认人工通过？", description: "这会记录为人工精审；请确认评分、来源、要点和 Rubric 已检查。", confirmLabel: "人工通过", danger: false }
      : pendingAction?.kind === "status"
        ? { title: "确认标记拒绝？", description: "被拒绝题目不会进入正式训练池。", confirmLabel: "标记拒绝", danger: true }
        : pendingAction?.kind === "quick-current"
          ? { title: "快速正式化当前题目？", description: "题目会直接加入正式训练池，但不会被记录为人工精审。", confirmLabel: "快速正式化", danger: false }
          : pendingAction?.kind === "batch-ai"
            ? { title: `批量 AI 评估 ${selectedIds.length} 道题？`, description: "每道题独立处理，单题失败不会影响其他题目。", confirmLabel: "开始评估", danger: false }
            : pendingAction?.kind === "batch-quick"
              ? { title: `将选中的 ${selectedIds.length} 道题直接加入训练池？`, description: "此操作不会被记录为人工精审。", confirmLabel: "批量正式化", danger: false }
              : pendingAction?.kind === "batch-reject"
                ? { title: `批量拒绝选中的 ${selectedIds.length} 道题？`, description: "被拒绝题目不会进入正式训练池。", confirmLabel: "批量拒绝", danger: true }
              : null;

  return (
    <div className="page-stack review-page">
      <header className="page-header review-page-header">
        <div><span className="page-kicker">题库审核</span><h1>把训练题留在可追溯的轨道上</h1></div>
        <p>人工精审、AI 审核和快速正式化共用同一工作区；评分来源会清楚保留。</p>
      </header>
      <div className="review-toolbar" aria-label="审核筛选与批量操作">
        <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="搜索题目" aria-label="搜索题目" />
        <select value={filters.reviewStatus} onChange={(event) => setFilters({ ...filters, reviewStatus: event.target.value as ReviewStatus })}><option value="pending">待审核</option><option value="verified">已正式化</option><option value="rejected">已拒绝</option></select>
        <select value={filters.domain} onChange={(event) => setFilters({ ...filters, domain: event.target.value as QuestionDomain | "" })}><option value="">全部方向</option>{domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value as Difficulty | "" })}><option value="">全部难度</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select>
        <span className="review-selection-count">已选 <strong className="tabular-number">{selectedIds.length}</strong></span>
        <details className="review-batch-menu"><summary>批量处理</summary><div>{aiReviewEnabled ? <button disabled={isSaving || !selectedIds.length} onClick={() => setPendingAction({ kind: "batch-ai" })} type="button">批量 AI 评估</button> : null}{quickPublishEnabled ? <button disabled={isSaving || !selectedIds.length} onClick={() => setPendingAction({ kind: "batch-quick" })} type="button">批量快速正式化</button> : null}<button className="menu-danger" disabled={isSaving || !selectedIds.length} onClick={() => setPendingAction({ kind: "batch-reject" })} type="button">批量拒绝</button></div></details>
      </div>
      {notice ? <p className="save-notice" role="status">{notice}</p> : null}
      <div className="review-workbench">
        <aside className="review-list-panel" aria-label="审核题目列表">
          <div className="review-list-header"><strong>题目列表</strong><div><span className="tabular-number">{isLoading ? "读取中" : visibleQuestions.length}</span>{visibleQuestions.length ? <button className="select-text-button" onClick={() => setSelectedIds(selectedIds.length === visibleQuestions.length ? [] : visibleQuestions.map((item) => item.id))} type="button">{selectedIds.length === visibleQuestions.length ? "清除选择" : "选择当前结果"}</button> : null}</div></div>
          <div className="review-question-list">{visibleQuestions.map((question) => <button className={question.id === selected?.id ? "review-question-item review-question-item-active" : "review-question-item"} key={question.id} onClick={() => selectQuestion(question)} type="button"><span className="review-question-check" onClick={(event) => event.stopPropagation()}><input checked={selectedIds.includes(question.id)} onChange={() => toggleSelected(question.id)} aria-label={`选择 ${question.id}`} type="checkbox" /></span><span>{question.domain} / {question.topic}</span><strong>{question.question}</strong><small>{question.review_status} / 人工 {question.human_quality_score ?? "—"} / AI {question.ai_quality_score ?? "—"} / {reviewMethodLabel(question.review_method)}</small></button>)}</div>
          {!isLoading && visibleQuestions.length === 0 ? <div className="empty-state"><p>当前筛选没有题目。</p></div> : null}
        </aside>
        <main className="review-main-panel">{draft ? <InterviewReviewEditor draft={draft} isSaving={isSaving} error={error} aiReviewEnabled={aiReviewEnabled} quickPublishEnabled={quickPublishEnabled} onChange={setDraft} onSave={() => void saveReview()} onRequestStatus={(status) => setPendingAction({ kind: "status", status })} onAiReview={() => void runAiReview()} onApplyAiReview={() => void applyAiReview()} onKeepPending={() => setNotice("AI 审核结果已保留，题目继续保持待审核。")} onQuickPublish={() => setPendingAction({ kind: "quick-current" })} /> : <div className="empty-state"><p>{error || "选择左侧的一道题开始审核。"}</p></div>}</main>
      </div>
      {dialog ? <ConfirmActionDialog open title={dialog.title} description={dialog.description} confirmLabel={dialog.confirmLabel} danger={dialog.danger} isConfirming={isSaving} onCancel={() => setPendingAction(null)} onConfirm={() => { if (pendingAction?.kind === "discard") { applyQuestion(pendingAction.nextQuestion); setPendingAction(null); } else if (pendingAction?.kind === "status") { void saveReview(pendingAction.status); } else if (pendingAction?.kind === "quick-current") { void quickPublishCurrent(); } else if (pendingAction?.kind === "batch-ai") { void runBatch("ai"); } else if (pendingAction?.kind === "batch-quick") { void runBatch("quick"); } else if (pendingAction?.kind === "batch-reject") { void runBatch("reject"); } }} /> : null}
    </div>
  );
}
