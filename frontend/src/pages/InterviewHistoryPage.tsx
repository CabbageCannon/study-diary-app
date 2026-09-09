import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/CaretUp";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TrashIcon } from "@phosphor-icons/react/Trash";

import {
  abandonInterviewQuestionSet,
  deleteInterviewQuestionSet,
  getInterviewQuestionSet,
  listInterviewQuestionSets,
  peekInterviewQuestionSet,
  peekInterviewQuestionSets,
  restartInterviewQuestionSet,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import type { InterviewQuestionSet, InterviewQuestionSetItem, InterviewQuestionSetSummary, QuestionSetStatus } from "../types/interview";

type HistoryFilter = "all" | QuestionSetStatus;
type HistoryAction = { type: "delete" | "abandon"; summary: InterviewQuestionSetSummary } | null;

const formatDate = (value: string) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
const statusLabel = (status: QuestionSetStatus) => ({ in_progress: "进行中", completed: "已完成", abandoned: "已放弃" })[status];
const itemStatusLabel = (status: InterviewQuestionSetItem["status"]) => ({ pending: "未作答", answered: "已回答", skipped: "已跳过" })[status];

export function InterviewHistoryPage() {
  const navigate = useNavigate();
  const initialSets = peekInterviewQuestionSets({ limit: 3 }) ?? [];
  const [sets, setSets] = useState<InterviewQuestionSetSummary[]>(initialSets);
  const [details, setDetails] = useState<Record<number, InterviewQuestionSet>>(() => Object.fromEntries(initialSets.flatMap((item) => {
    const detail = peekInterviewQuestionSet(item.id);
    return detail ? [[item.id, detail]] : [];
  })));
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [isLoading, setIsLoading] = useState(initialSets.length === 0);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<HistoryAction>(null);

  async function load(nextFilter: HistoryFilter) {
    if (sets.length === 0) setIsLoading(true);
    setError("");
    try {
      const data = await listInterviewQuestionSets({ status: nextFilter === "all" ? undefined : nextFilter, limit: 50, force: true });
      setSets(data);
      setExpandedId((current) => data.some((item) => item.id === current) ? current : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练历史加载失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load("all"); }, []);

  async function toggleSet(summary: InterviewQuestionSetSummary) {
    if (expandedId === summary.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(summary.id);
    const cached = details[summary.id] ?? peekInterviewQuestionSet(summary.id);
    if (cached) {
      setDetails((current) => ({ ...current, [summary.id]: cached }));
      return;
    }
    setLoadingId(summary.id);
    try {
      const detail = await getInterviewQuestionSet(summary.id);
      setDetails((current) => ({ ...current, [summary.id]: detail }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练详情加载失败。");
    } finally {
      setLoadingId(null);
    }
  }

  async function restart(summary: InterviewQuestionSetSummary) {
    setIsActing(true);
    try {
      const questionSet = await restartInterviewQuestionSet(summary.id);
      navigate(`/interview/session/${questionSet.id}`);
    } catch (restartError) {
      setError(restartError instanceof Error ? restartError.message : "重新创建训练失败，请稍后重试。");
    } finally {
      setIsActing(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    setIsActing(true);
    try {
      if (pendingAction.type === "delete") await deleteInterviewQuestionSet(pendingAction.summary.id);
      else await abandonInterviewQuestionSet(pendingAction.summary.id);
      setPendingAction(null);
      setExpandedId(null);
      await load(filter);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败，请稍后重试。");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div className="page-stack interview-history-page interview-workspace-panel">
      <section className="archive-list interview-history-accordion" aria-labelledby="training-history-title">
        <div className="archive-list-header"><h2 id="training-history-title">训练题集</h2><span>{isLoading ? "读取中" : `${sets.length} 组`}</span></div>
        <label className="history-filter"><span>状态</span><select value={filter} onChange={(event) => { const next = event.target.value as HistoryFilter; setFilter(next); void load(next); }}><option value="all">全部记录</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label>
        {!isLoading && sets.length === 0 ? <div className="empty-state"><p>还没有符合条件的训练记录。</p><Link className="button button-primary" to="/interview">开始训练</Link></div> : null}
        <div className="training-set-list">
          {sets.map((item) => (
            <HistoryRow
              detail={details[item.id]}
              expanded={expandedId === item.id}
              isActing={isActing}
              isLoading={loadingId === item.id}
              item={item}
              key={item.id}
              onAbandon={() => setPendingAction({ type: "abandon", summary: item })}
              onCollapse={() => setExpandedId(null)}
              onDelete={() => setPendingAction({ type: "delete", summary: item })}
              onRestart={() => void restart(item)}
              onResume={() => navigate(`/interview/session/${item.id}`)}
              onToggle={() => void toggleSet(item)}
            />
          ))}
        </div>
      </section>
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <ConfirmActionDialog confirmLabel={pendingAction?.type === "delete" ? "确认删除" : "确认放弃"} danger description={pendingAction?.type === "delete" ? "这会删除本次训练的回答和评分记录，但不会删除八股题库中的原题。" : "放弃后保留已经提交的回答和评分，但不能继续本次训练。"} isConfirming={isActing} onCancel={() => setPendingAction(null)} onConfirm={() => void confirmAction()} open={pendingAction !== null} title={pendingAction?.type === "delete" ? "删除训练记录？" : "放弃当前训练？"} />
    </div>
  );
}

interface HistoryRowProps {
  item: InterviewQuestionSetSummary;
  detail?: InterviewQuestionSet;
  expanded: boolean;
  isActing: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onCollapse: () => void;
  onResume: () => void;
  onRestart: () => void;
  onAbandon: () => void;
  onDelete: () => void;
}

function HistoryRow({ item, detail, expanded, isActing, isLoading, onToggle, onCollapse, onResume, onRestart, onAbandon, onDelete }: HistoryRowProps) {
  return (
    <article className={expanded ? "training-set-entry training-set-item-active" : "training-set-entry"}>
      <button aria-controls={`training-set-detail-${item.id}`} aria-expanded={expanded} className="training-set-item" onClick={onToggle} type="button">
        <time>{formatDate(item.date)}</time>
        <strong>{item.domain ?? "综合"} · {item.topic ?? "不限主题"}</strong>
        <span className="tabular-number">{item.answered_count}/{item.question_count} 题 · {item.average_score ?? "—"} 分</span>
        <small>{statusLabel(item.status)}</small>
        <CaretDownIcon aria-hidden="true" className="training-set-caret" size={18} weight="bold" />
      </button>
      {expanded ? (
        <section className="interview-history-inline-detail" id={`training-set-detail-${item.id}`}>
          <div className="history-collapse-bar"><span>本轮详情</span><button onClick={onCollapse} type="button"><CaretUpIcon aria-hidden="true" size={17} weight="bold" />收起本轮</button></div>
          <div className="training-set-actions">
            {item.status === "in_progress" ? <button className="button button-secondary" onClick={onResume} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续训练</button> : <button className="button button-secondary" disabled={isActing} onClick={onRestart} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />再次练习</button>}
            {item.status === "in_progress" ? <button className="button button-secondary" disabled={isActing} onClick={onAbandon} type="button"><FlagIcon aria-hidden="true" size={16} weight="bold" />放弃</button> : null}
            <button className="button button-danger" disabled={isActing} onClick={onDelete} type="button"><TrashIcon aria-hidden="true" size={16} weight="bold" />删除</button>
          </div>
          {isLoading ? <div className="history-detail-loading" role="status">正在读取本轮详情…</div> : null}
          {detail ? <HistorySetDetail questionSet={detail} /> : null}
        </section>
      ) : null}
    </article>
  );
}

function HistorySetDetail({ questionSet }: { questionSet: InterviewQuestionSet }) {
  return (
    <div className="history-answer-list">
      {questionSet.items.map((item) => {
        const evaluation = item.latest_evaluation;
        const needsWork = evaluation ? [...evaluation.incorrect_points, ...evaluation.missing_points] : [];
        return (
          <article className="history-answer-item" key={item.id}>
            <div className="history-question-heading"><span className="pane-label">第 {item.order_index + 1} 题 · {itemStatusLabel(item.status)}</span><h3>{item.question.question}</h3></div>
            <section className="history-answer-section"><h4>我的回答</h4>{item.latest_answer ? <p>{item.latest_answer.answer_text}</p> : <p className="history-answer-empty">{item.status === "skipped" ? "本题已跳过。" : "本题尚未作答。"}</p>}</section>
            {evaluation ? (
              <section className="history-analysis-section">
                <div className="history-analysis-heading"><h4>LLM 解析</h4><strong className="tabular-number">{evaluation.total_score} 分</strong></div>
                {evaluation.matched_points.length ? <div><h5>回答到的要点</h5><ul>{evaluation.matched_points.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
                {needsWork.length ? <div><h5>需要补充</h5><ul>{needsWork.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
                <div><h5>参考表达</h5><p>{evaluation.improved_answer}</p></div>
              </section>
            ) : item.latest_answer ? <p className="history-analysis-pending">LLM 解析尚未完成。</p> : null}
          </article>
        );
      })}
    </div>
  );
}
