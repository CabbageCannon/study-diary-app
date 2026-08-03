import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TrashIcon } from "@phosphor-icons/react/Trash";

import {
  abandonInterviewQuestionSet,
  deleteInterviewQuestionSet,
  getInterviewQuestionSet,
  listInterviewQuestionSets,
  restartInterviewQuestionSet,
} from "../api/interviews";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import type { InterviewQuestionSet, InterviewQuestionSetSummary, QuestionSetStatus } from "../types/interview";

type HistoryFilter = "all" | QuestionSetStatus;
type HistoryAction = { type: "delete" | "abandon"; summary: InterviewQuestionSetSummary } | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function statusLabel(status: QuestionSetStatus) {
  return { in_progress: "进行中", completed: "已完成", abandoned: "已放弃" }[status];
}

export function InterviewHistoryPage() {
  const navigate = useNavigate();
  const [sets, setSets] = useState<InterviewQuestionSetSummary[]>([]);
  const [selected, setSelected] = useState<InterviewQuestionSet | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<HistoryAction>(null);

  const load = useCallback(async (nextFilter = filter) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listInterviewQuestionSets({ status: nextFilter === "all" ? undefined : nextFilter });
      setSets(data);
      const selectedId = selected?.id;
      const nextSelected = data.find((item) => item.id === selectedId) ?? data[0];
      setSelected(nextSelected ? await getInterviewQuestionSet(nextSelected.id) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练历史加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [filter, selected?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectSet(summary: InterviewQuestionSetSummary) {
    setError("");
    try {
      setSelected(await getInterviewQuestionSet(summary.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练详情加载失败。");
    }
  }

  async function changeFilter(nextFilter: HistoryFilter) {
    setFilter(nextFilter);
    await load(nextFilter);
  }

  async function restart(summary: InterviewQuestionSetSummary) {
    setIsActing(true);
    setError("");
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
    if (!pendingAction) {
      return;
    }
    setIsActing(true);
    setError("");
    try {
      if (pendingAction.type === "delete") {
        await deleteInterviewQuestionSet(pendingAction.summary.id);
      } else {
        await abandonInterviewQuestionSet(pendingAction.summary.id);
      }
      setPendingAction(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败，请稍后重试。");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div className="page-stack interview-history-page">
      <header className="page-header"><div><span className="page-kicker">训练记录</span><h1>训练历史</h1></div><p>进行中、已完成和已放弃的训练都保留在这里。</p></header>
      <div className="history-workbench interview-history-workbench">
        <section className="archive-list" aria-labelledby="training-history-title">
          <div className="archive-list-header"><h2 id="training-history-title">训练题集</h2><span>{isLoading ? "读取中" : `${sets.length} 组`}</span></div>
          <label className="history-filter"><span>状态</span><select value={filter} onChange={(event) => void changeFilter(event.target.value as HistoryFilter)}><option value="all">全部记录</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label>
          {!isLoading && sets.length === 0 ? <div className="empty-state"><p>还没有符合条件的训练记录。</p><Link className="button button-primary" to="/interview">开始训练</Link></div> : null}
          <div className="training-set-list">
            {sets.map((item) => (
              <article className={selected?.id === item.id ? "training-set-entry training-set-item-active" : "training-set-entry"} key={item.id}>
                <button className="training-set-item" onClick={() => void selectSet(item)} type="button">
                  <time>{formatDate(item.date)}</time>
                  <strong>{item.domain ?? "综合"} · {item.topic ?? "不限主题"}</strong>
                  <span className="tabular-number">{item.answered_count}/{item.question_count} 题 · {item.average_score ?? "—"} 分</span>
                  <small>{statusLabel(item.status)}</small>
                </button>
                <div className="training-set-actions">
                  {item.status === "in_progress" ? <button className="button button-secondary" onClick={() => navigate(`/interview/session/${item.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续</button> : <button className="button button-secondary" disabled={isActing} onClick={() => void restart(item)} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />再次练习</button>}
                  {item.status === "in_progress" ? <button className="button button-secondary" disabled={isActing} onClick={() => setPendingAction({ type: "abandon", summary: item })} type="button"><FlagIcon aria-hidden="true" size={16} weight="bold" />放弃</button> : null}
                  <button className="button button-danger" disabled={isActing} onClick={() => setPendingAction({ type: "delete", summary: item })} type="button"><TrashIcon aria-hidden="true" size={16} weight="bold" />删除</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="detail-panel interview-history-detail" aria-label="训练详情">
          {selected ? <div className="history-answer-list">{selected.items.map((item) => <article className="history-answer-item" key={item.id}><div><span className="pane-label">{item.order_index + 1} · {item.status}</span><h2>{item.question.question}</h2></div>{item.latest_answer ? <><p className="history-answer-text">{item.latest_answer.answer_text}</p>{item.latest_evaluation ? <p className="history-score">总分 <strong className="tabular-number">{item.latest_evaluation.total_score}</strong> · 下次复习 {item.next_review_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(item.next_review_at)) : "待安排"}</p> : <p className="field-error">评分未完成，可重新进入该题集评价。</p>}</> : <p className="history-answer-empty">{item.status === "skipped" ? "本题已跳过。" : "本题尚未作答。"}</p>}</article>)}</div> : <div className="empty-state"><p>选择左侧题集后查看逐题记录。</p></div>}
        </section>
      </div>
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <ConfirmActionDialog
        confirmLabel={pendingAction?.type === "delete" ? "确认删除" : "确认放弃"}
        danger
        description={pendingAction?.type === "delete" ? "这会删除本次训练的回答和评分记录，但不会删除八股题库中的原题。" : "放弃后保留已经提交的回答和评分，但不能继续本次训练。"}
        isConfirming={isActing}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void confirmAction()}
        open={pendingAction !== null}
        title={pendingAction?.type === "delete" ? "删除训练记录？" : "放弃当前训练？"}
      />
    </div>
  );
}
