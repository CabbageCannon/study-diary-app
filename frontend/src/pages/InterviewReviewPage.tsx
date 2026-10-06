import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";

import {
  aiReviewInterviewQuestion,
  applyAiInterviewReview,
  listInterviewQuestions,
  quickPublishInterviewQuestions,
  reviewInterviewQuestion,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import { InterviewReviewEditor, toReviewPayload } from "../components/interview/InterviewReviewEditor";
import { PopoverMenu } from "../components/interview/PopoverMenu";
import { domainOptions } from "../components/interview/InterviewSetupForm";
import { useInterviewBatchJobs } from "../contexts/InterviewBatchJobContext";
import type { Difficulty, InterviewBatchJobType, InterviewQuestion, QuestionDomain, ReviewStatus } from "../types/interview";

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
  | { kind: "batch"; type: InterviewBatchJobType };

function reviewMethodLabel(value: InterviewQuestion["review_method"]) {
  return value === "human" ? "人工" : value === "ai_auto" ? "AI" : value === "manual_override" ? "快速" : "未审";
}

function batchActionCopy(type: InterviewBatchJobType, count: number) {
  if (type === "ai_review") return { title: `批量 AI 评估 ${count} 道题？`, description: "任务会转入后台；每道题独立处理，单题失败不会影响其他题目。", confirmLabel: "转入后台", danger: false };
  if (type === "quick_publish") return { title: `将选中的 ${count} 道题直接加入训练池？`, description: "任务会转入后台，且不会被记录为人工精审。", confirmLabel: "批量正式化", danger: false };
  return { title: `批量拒绝选中的 ${count} 道题？`, description: "任务会转入后台；被拒绝题目不会进入正式训练池。", confirmLabel: "批量拒绝", danger: true };
}

export function InterviewReviewPage() {
  const [filters, setFilters] = useState<ReviewFilters>(initialFilters);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [selected, setSelected] = useState<InterviewQuestion | null>(null);
  const [draft, setDraft] = useState<InterviewQuestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCurrentQuestion, setIsSavingCurrentQuestion] = useState(false);
  const [isRunningCurrentAiReview, setIsRunningCurrentAiReview] = useState(false);
  const [isSubmittingBatchJob, setIsSubmittingBatchJob] = useState(false);
  const [error, setError] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const hadProcessingRef = useRef(false);
  const { processingQuestionIds, submitBatchJob, notify } = useInterviewBatchJobs();

  const loadQuestions = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listInterviewQuestions({
        domain: filters.domain || undefined,
        topic: filters.topic || undefined,
        difficulty: filters.difficulty || undefined,
        reviewStatus: filters.reviewStatus,
      }, signal);
      if (signal?.aborted) return;
      setQuestions(data);
      setSelected((current) => data.find((item) => item.id === current?.id) ?? data[0] ?? null);
      setDraft((current) => data.find((item) => item.id === current?.id) ?? data[0] ?? null);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "审核题目加载失败。");
      setQuestions([]);
      setSelected(null);
      setDraft(null);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [filters.domain, filters.difficulty, filters.reviewStatus, filters.topic]);

  useEffect(() => {
    const controller = new AbortController();
    listRef.current?.scrollTo({ top: 0 });
    void loadQuestions(controller.signal);
    return () => controller.abort();
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

  useEffect(() => {
    if (processingQuestionIds.size) {
      hadProcessingRef.current = true;
      return;
    }
    if (hadProcessingRef.current) {
      hadProcessingRef.current = false;
      void loadQuestions();
    }
  }, [loadQuestions, processingQuestionIds]);

  const isDirty = Boolean(selected && draft && JSON.stringify(toReviewPayload(selected)) !== JSON.stringify(toReviewPayload(draft)));
  const allVisibleSelected = Boolean(visibleQuestions.length) && visibleQuestions.every((question) => selectedIds.includes(question.id));
  const isDraftProcessing = Boolean(draft && processingQuestionIds.has(draft.id));

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
    setMobileView("detail");
    setError("");
  }

  function toggleSelected(questionId: string) {
    setSelectedIds((current) => current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]);
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleQuestions.some((question) => question.id === id))
      : Array.from(new Set([...current, ...visibleQuestions.map((question) => question.id)])));
    notify(allVisibleSelected ? "已清除当前结果的选择。" : `已选择当前结果中的 ${visibleQuestions.length} 道题。`, "info");
  }

  async function saveReview(status?: ReviewStatus) {
    if (!draft) return;
    setIsSavingCurrentQuestion(true);
    setError("");
    try {
      const updated = await reviewInterviewQuestion(draft.id, toReviewPayload(draft, status));
      applyQuestion(updated);
      notify(status === "verified" ? "已按人工精审通过并加入训练池。" : status === "rejected" ? "题目已标记为 rejected。" : "修改已保存。", "success");
      setPendingAction(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "审核结果保存失败。");
      setPendingAction(null);
    } finally {
      setIsSavingCurrentQuestion(false);
    }
  }

  async function runAiReview() {
    if (!draft) return;
    setIsRunningCurrentAiReview(true);
    setError("");
    try {
      const result = await aiReviewInterviewQuestion(draft.id);
      applyQuestion(result.question);
      notify("AI 审核已完成，结果已保存。", "success");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "AI 审核失败。");
    } finally {
      setIsRunningCurrentAiReview(false);
    }
  }

  async function applyAiReview() {
    if (!draft) return;
    setIsSavingCurrentQuestion(true);
    setError("");
    try {
      const result = await applyAiInterviewReview(draft.id);
      applyQuestion(result.question);
      notify(result.published ? "已采用 AI 建议并加入训练池。" : "AI 建议未满足正式化规则，题目保持待审核。", "success");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "采用 AI 建议失败。");
    } finally {
      setIsSavingCurrentQuestion(false);
    }
  }

  async function quickPublishCurrent() {
    if (!draft) return;
    setIsSavingCurrentQuestion(true);
    try {
      const result = await quickPublishInterviewQuestions([draft.id]);
      notify(result.published ? "题目已通过快速正式化进入训练池。" : result.items[0]?.message ?? "没有题目被正式化。", "success");
      setPendingAction(null);
      await loadQuestions();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "快速正式化失败。");
      setPendingAction(null);
    } finally {
      setIsSavingCurrentQuestion(false);
    }
  }

  async function submitBatch(type: InterviewBatchJobType) {
    if (!selectedIds.length) return;
    setIsSubmittingBatchJob(true);
    setError("");
    try {
      const job = await submitBatchJob({ type, question_ids: selectedIds, auto_publish: false });
      setPendingAction(null);
      setSelectedIds([]);
      notify(`${job.total} 道题已转入后台${type === "ai_review" ? " AI 审核" : type === "quick_publish" ? "快速正式化" : "拒绝"}任务。`, "info");
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "批量任务提交失败。");
      setPendingAction(null);
    } finally {
      setIsSubmittingBatchJob(false);
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
          : pendingAction?.kind === "batch"
            ? batchActionCopy(pendingAction.type, selectedIds.length)
            : null;
  const isDialogConfirming = isSavingCurrentQuestion || isSubmittingBatchJob;

  return (
    <div className="page-stack review-page">
      <header className="page-header review-page-header">
        <div><span className="page-kicker">训练题库</span><h1>题库审核</h1></div>
        <p>待审核 {questions.filter((question) => question.review_status === "pending").length} 题 · 当前筛选 {visibleQuestions.length} 题</p>
      </header>
      <details className="review-mobile-filters">
        <summary>筛选与批量操作</summary>
        <div className="review-toolbar" aria-label="审核筛选与批量操作">
        <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="搜索题目" aria-label="搜索题目" />
        <select value={filters.reviewStatus} onChange={(event) => setFilters({ ...filters, reviewStatus: event.target.value as ReviewStatus })}><option value="pending">待审核</option><option value="verified">已正式化</option><option value="rejected">已拒绝</option></select>
        <select value={filters.domain} onChange={(event) => setFilters({ ...filters, domain: event.target.value as QuestionDomain | "" })}><option value="">全部方向</option>{domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value as Difficulty | "" })}><option value="">全部难度</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select>
        {selectedIds.length ? <span className="review-selection-count">已选 <strong className="tabular-number">{selectedIds.length}</strong></span> : null}
        {selectedIds.length ? <PopoverMenu label="批量处理" className="review-batch-menu" disabled={isSubmittingBatchJob}>
          {aiReviewEnabled ? <button disabled={!selectedIds.length} role="menuitem" onClick={() => setPendingAction({ kind: "batch", type: "ai_review" })} type="button">批量 AI 评估</button> : null}
          {quickPublishEnabled ? <button disabled={!selectedIds.length} role="menuitem" onClick={() => setPendingAction({ kind: "batch", type: "quick_publish" })} type="button">批量快速正式化</button> : null}
          <button className="menu-danger" disabled={!selectedIds.length} role="menuitem" onClick={() => setPendingAction({ kind: "batch", type: "reject" })} type="button">批量拒绝</button>
        </PopoverMenu> : null}
        </div>
      </details>
      <div className={`review-workbench review-mobile-${mobileView}`}>
        <aside className="review-list-panel" aria-label="审核题目列表">
          <div className="review-list-header"><strong>题目列表</strong><div><span className="tabular-number">{isLoading ? "读取中" : visibleQuestions.length}</span>{visibleQuestions.length ? <button className="select-text-button" onClick={toggleVisibleSelection} type="button">{allVisibleSelected ? "清除选择" : "选择当前结果"}</button> : null}</div></div>
          <div className="review-question-list" ref={listRef}>{visibleQuestions.map((question) => {
            const isProcessing = processingQuestionIds.has(question.id);
            return <article className={question.id === selected?.id ? "review-question-item review-question-item-active" : "review-question-item"} key={question.id}>
              <label className="review-question-check"><input checked={selectedIds.includes(question.id)} onChange={() => toggleSelected(question.id)} aria-label={`选择 ${question.id}`} type="checkbox" /></label>
              <button className="review-question-select" onClick={() => selectQuestion(question)} type="button"><span>{question.domain} / {question.topic} / {question.difficulty}</span><strong>{question.question}</strong><small>{isProcessing ? "处理中" : `${question.review_status} / 人工 ${question.human_quality_score ?? "—"} / AI ${question.ai_quality_score ?? "—"} / ${reviewMethodLabel(question.review_method)}`}</small></button>
            </article>;
          })}{!isLoading && visibleQuestions.length === 0 ? <div className="empty-state"><p>当前筛选没有题目。</p></div> : null}</div>
        </aside>
        <section className="review-main-panel" aria-label="题目审核编辑区">
          {draft ? <>
            <button className="review-mobile-back" onClick={() => setMobileView("list")} type="button"><ArrowLeftIcon aria-hidden="true" size={17} weight="bold" />题目列表</button>
            <InterviewReviewEditor draft={draft} isSaving={isSavingCurrentQuestion} isRunningAiReview={isRunningCurrentAiReview} isProcessingInBatch={isDraftProcessing} error={error} aiReviewEnabled={aiReviewEnabled} quickPublishEnabled={quickPublishEnabled} onChange={setDraft} onSave={() => void saveReview()} onRequestStatus={(status) => setPendingAction({ kind: "status", status })} onAiReview={() => void runAiReview()} onApplyAiReview={() => void applyAiReview()} onKeepPending={() => notify("AI 审核结果已保留，题目继续保持待审核。", "info")} onQuickPublish={() => setPendingAction({ kind: "quick-current" })} />
          </> : <div className="empty-state"><p>{error || "选择一题开始审核。"}</p></div>}
        </section>
      </div>
      {dialog ? <ConfirmActionDialog open title={dialog.title} description={dialog.description} confirmLabel={dialog.confirmLabel} danger={dialog.danger} isConfirming={isDialogConfirming} onCancel={() => setPendingAction(null)} onConfirm={() => { if (pendingAction?.kind === "discard") { applyQuestion(pendingAction.nextQuestion); setMobileView("detail"); setPendingAction(null); } else if (pendingAction?.kind === "status") { void saveReview(pendingAction.status); } else if (pendingAction?.kind === "quick-current") { void quickPublishCurrent(); } else if (pendingAction?.kind === "batch") { void submitBatch(pendingAction.type); } }} /> : null}
    </div>
  );
}
