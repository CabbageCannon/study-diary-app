import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TrashIcon } from "@phosphor-icons/react/Trash";

import { deleteAlgorithmSession, getAlgorithmSession, listAlgorithmSessions } from "../api/algorithms";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import type { AlgorithmSession, AlgorithmSessionStatus, AlgorithmSessionSummary } from "../types/algorithm";

type Filter = "all" | AlgorithmSessionStatus;

function statusLabel(status: AlgorithmSessionStatus) {
  return { in_progress: "进行中", completed: "已完成", abandoned: "已放弃" }[status];
}

function modeLabel(mode: string) {
  return { daily: "每日一题", hot100: "Hot 100", topic: "按题型", difficulty: "按难度", random: "随机", weakness: "薄弱点", wrong: "错题", similar: "相似题", custom: "自定义", review: "复习" }[mode] ?? mode;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AlgorithmHistoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sessions, setSessions] = useState<AlgorithmSessionSummary[]>([]);
  const [selected, setSelected] = useState<AlgorithmSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AlgorithmSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async (nextFilter = filter) => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listAlgorithmSessions(nextFilter === "all" ? undefined : nextFilter);
      setSessions(data);
      const next = data.find((item) => item.id === selected?.id) ?? data[0];
      setSelected(next ? await getAlgorithmSession(next.id) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练历史加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [filter, selected?.id]);

  useEffect(() => { void load(); }, [load]);

  async function choose(summary: AlgorithmSessionSummary) {
    setError("");
    try {
      setSelected(await getAlgorithmSession(summary.id));
    } catch (chooseError) {
      setError(chooseError instanceof Error ? chooseError.message : "训练详情加载失败。");
    }
  }

  async function removeSelected() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteAlgorithmSession(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除训练记录失败。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="algorithm-workspace-panel algorithm-history-page">
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <div className="history-workbench algorithm-history-workbench">
        <section className="archive-list" aria-labelledby="algorithm-history-list-title"><div className="archive-list-header"><h2 id="algorithm-history-list-title">训练会话</h2><span>{isLoading ? "读取中" : `${sessions.length} 组`}</span></div><label className="history-filter"><span>状态</span><select value={filter} onChange={(event) => { const next = event.target.value as Filter; setFilter(next); void load(next); }}><option value="all">全部记录</option><option value="in_progress">进行中</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label>{!isLoading && !sessions.length ? <div className="empty-state"><p>还没有算法训练记录。</p><Link className="button button-primary" to="/algorithms">开始训练</Link></div> : null}<div className="training-set-list">{sessions.map((item) => <article className={selected?.id === item.id ? "training-set-entry training-set-item-active" : "training-set-entry"} key={item.id}><button className="training-set-item" onClick={() => void choose(item)} type="button"><time>{formatDate(item.last_active_at)}</time><strong>{modeLabel(item.mode)}</strong><span className="tabular-number">{item.solved_count}/{item.question_count} 已完成 · {item.needs_review_count} 待复习</span><small>{statusLabel(item.status)}</small></button>{item.status === "in_progress" ? <button className="training-set-quick-action" aria-label="继续训练" onClick={() => navigate(`/algorithms/session/${item.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" /></button> : null}</article>)}</div></section>
        <section className="detail-panel algorithm-history-detail" aria-label="算法训练详情">{selected ? <><div className="history-detail-heading"><div><span className="pane-label">{statusLabel(selected.status)}</span><h2>{modeLabel(selected.mode)}</h2><p>{formatDate(selected.started_at)} 开始</p></div><div className="history-detail-actions">{selected.status === "in_progress" ? <button className="button button-primary" onClick={() => navigate(`/algorithms/session/${selected.id}`)} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续</button> : <button className="button button-secondary" onClick={() => navigate("/algorithms")} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />再练一次</button>}<button className="button button-danger" onClick={() => setPendingDelete(selected)} type="button"><TrashIcon aria-hidden="true" size={16} weight="bold" />删除</button></div></div><div className="history-answer-list">{selected.items.map((item) => <article className="history-answer-item" key={item.id}><div><span className="pane-label">第 {item.position + 1} 题 · {item.status}</span><h3>{item.problem.title_zh || item.problem.title}</h3><p>{item.problem.topics.join(" · ")}</p></div>{item.latest_attempt ? <div className="algorithm-history-attempt"><span>{item.latest_attempt.result === "solved" ? "已解决" : "待复习"}</span><strong className="tabular-number">{item.latest_attempt.duration_seconds ? `${Math.ceil(item.latest_attempt.duration_seconds / 60)} 分` : "未计时"}</strong><p>{item.latest_attempt.approach || "未记录思路"}</p></div> : <p className="history-answer-empty">尚未提交记录</p>}</article>)}</div></> : <div className="empty-state"><p>选择一组训练，查看每道题的记录。</p></div>}</section>
      </div>
      <ConfirmActionDialog confirmLabel="确认删除" danger description="这会删除会话与其中的解题记录，但不会删除本地题库中的原题。" isConfirming={isDeleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void removeSelected()} open={pendingDelete !== null} title="删除训练记录" />
    </div>
  );
}
