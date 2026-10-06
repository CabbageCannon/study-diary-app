import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { TrashIcon } from "@phosphor-icons/react/Trash";

import { listAlgorithmReasoningAnswers } from "../api/algorithmReasoning";
import { deleteAlgorithmSession, getAlgorithmSession, listAlgorithmSessions } from "../api/algorithms";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import type { AlgorithmAttempt, AlgorithmItemStatus, AlgorithmSession, AlgorithmSessionStatus, AlgorithmSessionSummary } from "../types/algorithm";
import type { AlgorithmReasoningAnswer, AlgorithmReasoningFeedback } from "../types/algorithmReasoning";

type Filter = "all" | AlgorithmSessionStatus;
type ReasoningRecord = { answer: AlgorithmReasoningAnswer; feedback: AlgorithmReasoningFeedback | null };

const statusLabel = (status: AlgorithmSessionStatus) => ({ in_progress: "进行中", completed: "已完成", abandoned: "已放弃" })[status];
const itemStatusLabel = (status: AlgorithmItemStatus) => ({ pending: "未开始", in_progress: "进行中", solved: "已完成", needs_review: "待复习", skipped: "已跳过" })[status];
const resultLabel = (result: AlgorithmAttempt["result"]) => ({ solved: "已解出", partially_solved: "部分正确", failed: "未通过", gave_up: "放弃" })[result];
const conclusionLabel = (conclusion: AlgorithmReasoningFeedback["conclusion"]) => ({ correct: "思路正确", partially_correct: "部分正确", critical_error: "存在关键错误", insufficient_context: "需要补充信息" })[conclusion];
const modeLabel = (mode: string) => ({ daily: "日常", hot100: "Hot 100", topic: "按题型", difficulty: "按难度", random: "随机", weakness: "薄弱点", wrong: "错题", similar: "相似题", custom: "自定义", review: "复习" })[mode] ?? mode;
const formatDate = (value: string) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function AlgorithmHistoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sessions, setSessions] = useState<AlgorithmSessionSummary[]>([]);
  const [details, setDetails] = useState<Record<string, AlgorithmSession>>({});
  const [reasoning, setReasoning] = useState<Record<string, ReasoningRecord[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AlgorithmSession | null>(null);

  const load = useCallback(async (nextFilter: Filter) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listAlgorithmSessions(nextFilter === "all" ? undefined : nextFilter);
      setSessions(data);
      setExpandedId((current) => data.some((item) => item.id === current) ? current : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练历史加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  async function toggle(summary: AlgorithmSessionSummary) {
    if (expandedId === summary.id) { setExpandedId(null); return; }
    setExpandedId(summary.id);
    if (details[summary.id]) return;
    setLoadingId(summary.id);
    setError("");
    try {
      const [detail, answers] = await Promise.all([
        getAlgorithmSession(summary.id),
        listAlgorithmReasoningAnswers(summary.id).catch(() => []),
      ]);
      setDetails((current) => ({ ...current, [summary.id]: detail }));
      setReasoning((current) => ({ ...current, [summary.id]: answers }));
    } catch (chooseError) {
      setExpandedId(null);
      setError(chooseError instanceof Error ? chooseError.message : "训练详情加载失败。");
    } finally {
      setLoadingId(null);
    }
  }

  function removeSelected() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const previous = sessions;
    setPendingDelete(null);
    setExpandedId(null);
    setSessions((current) => current.filter((item) => item.id !== target.id));
    void deleteAlgorithmSession(target.id).catch((deleteError) => {
      setSessions(previous);
      setExpandedId(target.id);
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，训练记录已经恢复。");
    });
  }

  return (
    <div className="algorithm-workspace-panel algorithm-history-page">
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <section className="algorithm-history-surface" aria-labelledby="algorithm-history-list-title">
        <header className="algorithm-history-toolbar"><div><h2 id="algorithm-history-list-title">训练记录</h2><span>{isLoading ? "读取中" : `${sessions.length} 组`}</span></div><label className="algorithm-history-filter"><span>状态</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">全部</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label></header>
        {!isLoading && !sessions.length ? <div className="empty-state"><p>还没有算法训练记录。</p><Link className="button button-primary" to="/algorithms">开始训练</Link></div> : null}
        <div className="algorithm-history-list">{sessions.map((item) => {
          const expanded = expandedId === item.id;
          const detail = details[item.id];
          return <article className={expanded ? "algorithm-history-entry is-expanded" : "algorithm-history-entry"} key={item.id}>
            <button aria-controls={`algorithm-history-detail-${item.id}`} aria-expanded={expanded} className="algorithm-history-row" onClick={() => void toggle(item)} type="button"><time>{formatDate(item.last_active_at)}</time><strong>{modeLabel(item.mode)}</strong><small>{statusLabel(item.status)}</small><CaretDownIcon aria-hidden="true" size={16} weight="bold" /></button>
            <section className={expanded ? "algorithm-history-inline-detail is-open" : "algorithm-history-inline-detail"} aria-hidden={!expanded} id={`algorithm-history-detail-${item.id}`} inert={!expanded}>
              <div className="algorithm-history-detail-inner">
              {loadingId === item.id ? <div className="algorithm-history-loading" role="status"><SpinnerGapIcon aria-hidden="true" size={18} />正在读取详情…</div> : null}
              {detail ? <><div className="algorithm-history-summary"><span><strong>{detail.question_count}</strong>题</span><span><strong>{detail.items.filter((entry) => entry.status === "solved").length}</strong>完成</span><span><strong>{detail.items.filter((entry) => entry.status === "needs_review").length}</strong>待复习</span></div><div className="algorithm-history-actions">{detail.status === "in_progress" ? <button className="button button-primary" onClick={() => navigate(`/algorithms/session/${detail.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续训练</button> : <button className="button button-secondary" onClick={() => navigate("/algorithms")} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />再练一次</button>}<button className="button button-danger" onClick={() => setPendingDelete(detail)} type="button"><TrashIcon aria-hidden="true" size={16} weight="bold" />删除</button></div><div className="algorithm-history-problems">{detail.items.map((entry) => {
                const reasoningRecord = reasoning[detail.id]?.find((record) => record.answer.problem_id === entry.problem.stable_key);
                return <article className="algorithm-history-record" key={entry.id}><div><small>第 {entry.position + 1} 题 · {itemStatusLabel(entry.status)}</small><h3>{entry.problem.title_zh || entry.problem.title}</h3><p>{entry.problem.topics.join(" · ") || "综合"}</p></div>{entry.latest_attempt || reasoningRecord ? <AlgorithmAttemptDetail attempt={entry.latest_attempt} reasoning={reasoningRecord} /> : <p className="history-answer-empty">尚未提交记录</p>}</article>;
              })}</div></> : null}
              </div>
            </section>
          </article>;
        })}</div>
      </section>
      <ConfirmActionDialog confirmLabel="确认删除" danger description="这会删除会话与其中的解题记录，但不会删除本地题库中的原题。" onCancel={() => setPendingDelete(null)} onConfirm={removeSelected} open={pendingDelete !== null} title="删除训练记录" />
    </div>
  );
}

function AlgorithmAttemptDetail({ attempt, reasoning }: { attempt: AlgorithmAttempt | null; reasoning?: ReasoningRecord }) {
  const details = reasoning?.answer.details;
  const legacyFeedback = attempt?.ai_feedback && "summary" in attempt.ai_feedback ? attempt.ai_feedback : null;

  return (
    <div className="algorithm-history-attempt-detail copyable-text">
      {attempt ? <div className="algorithm-history-attempt-meta"><span>{resultLabel(attempt.result)}</span><span className="tabular-number">{attempt.duration_seconds ? `${Math.ceil(attempt.duration_seconds / 60)} 分钟` : "未计时"}</span>{attempt.needs_review ? <span>已加入复习</span> : null}</div> : null}
      <section className="history-answer-section"><h4>我的回答</h4><p>{reasoning?.answer.answer_text || attempt?.approach || "未记录思路"}</p></section>
      {details?.time_complexity || attempt?.time_complexity ? <p><strong>时间复杂度</strong>{details?.time_complexity || attempt?.time_complexity}</p> : null}
      {details?.space_complexity || attempt?.space_complexity ? <p><strong>空间复杂度</strong>{details?.space_complexity || attempt?.space_complexity}</p> : null}
      {details?.notes ? <p><strong>补充说明</strong>{details.notes}</p> : null}
      {details?.code || attempt?.code ? <pre className="algorithm-history-code"><code>{details?.code || attempt?.code}</code></pre> : null}
      {reasoning?.feedback ? <ReasoningFeedback feedback={reasoning.feedback} /> : legacyFeedback ? <section className="history-analysis-section"><div className="history-analysis-heading"><h4>LLM 反馈</h4><strong>{legacyFeedback.needs_review ? "建议复习" : "已掌握"}</strong></div><p>{legacyFeedback.summary}</p>{legacyFeedback.correct_parts.length ? <div><h5>回答正确</h5><ul>{legacyFeedback.correct_parts.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{legacyFeedback.issues.length || legacyFeedback.missing_edge_cases.length ? <div><h5>需要补充</h5><ul>{[...legacyFeedback.issues, ...legacyFeedback.missing_edge_cases].map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<div><h5>参考思路</h5><p>{legacyFeedback.better_approach}</p></div></section> : attempt?.reflection || attempt?.mistakes ? <section className="history-analysis-section"><div className="history-analysis-heading"><h4>LLM 反馈</h4></div>{attempt.reflection ? <p>{attempt.reflection}</p> : null}{attempt.mistakes ? <div><h5>需要补充</h5><p>{attempt.mistakes}</p></div> : null}</section> : attempt?.ai_feedback_status === "processing" ? <p className="history-analysis-pending">LLM 反馈生成中。</p> : attempt?.ai_feedback_status === "failed" ? <p className="field-error">LLM 反馈生成失败，可回到训练中重新核对。</p> : null}
    </div>
  );
}

function ReasoningFeedback({ feedback }: { feedback: AlgorithmReasoningFeedback }) {
  const complexity = [feedback.complexity.time, feedback.complexity.space].filter((item) => item.expected || item.note);
  return <section className="history-analysis-section"><div className="history-analysis-heading"><h4>LLM 解析</h4><strong className="tabular-number">{feedback.accuracy_score} 分 · {conclusionLabel(feedback.conclusion)}</strong></div><p>{feedback.headline}</p>{feedback.correct_parts.length ? <div><h5>回答正确</h5><ul>{feedback.correct_parts.map((item) => <li key={item.point}>{item.point}</li>)}</ul></div> : null}{feedback.issues_or_missing.length ? <div><h5>需要补充</h5><ul>{feedback.issues_or_missing.map((item) => <li key={item.detail}>{item.detail}</li>)}</ul></div> : null}{feedback.counterexample_or_followup.content ? <div><h5>{feedback.counterexample_or_followup.kind === "counterexample" ? "反例" : "追问"}</h5><p>{feedback.counterexample_or_followup.content}</p></div> : null}{complexity.length ? <div><h5>复杂度</h5><ul>{complexity.map((item, index) => <li key={index}>{item.expected}{item.note ? `：${item.note}` : ""}</li>)}</ul></div> : null}{feedback.reference_outline ? <div><h5>参考思路</h5><p>{feedback.reference_outline}</p></div> : null}{feedback.followup_for_supplement ? <div><h5>下一步</h5><p>{feedback.followup_for_supplement}</p></div> : null}</section>;
}
