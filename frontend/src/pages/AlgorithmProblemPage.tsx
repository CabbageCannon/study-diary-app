import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ClockIcon } from "@phosphor-icons/react/Clock";

import { deleteAlgorithmAttempt, getAlgorithmProblem, getSimilarAlgorithmProblems, listAlgorithmAttempts } from "../api/algorithms";
import { ConfirmActionDialog } from "../components/interview/ConfirmActionDialog";
import type { AlgorithmAttempt, AlgorithmProblem } from "../types/algorithm";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AlgorithmProblemPage() {
  const { problemId = "" } = useParams();
  const [problem, setProblem] = useState<AlgorithmProblem | null>(null);
  const [attempts, setAttempts] = useState<AlgorithmAttempt[]>([]);
  const [similar, setSimilar] = useState<AlgorithmProblem[]>([]);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AlgorithmAttempt | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!problemId) return;
    setError("");
    try {
      const nextProblem = await getAlgorithmProblem(problemId);
      const [attemptData, similarData] = await Promise.all([listAlgorithmAttempts({ problem_id: nextProblem.id }), getSimilarAlgorithmProblems(nextProblem.id)]);
      setProblem(nextProblem);
      setAttempts(attemptData);
      setSimilar(similarData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "题目详情加载失败。");
    }
  }, [problemId]);

  useEffect(() => { void load(); }, [load]);

  async function removeAttempt() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteAlgorithmAttempt(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除记录失败。");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!problem && !error) return <div className="page-stack"><div className="skeleton-block skeleton-session" /></div>;
  if (!problem) return <div className="page-stack"><div className="empty-state"><p>{error}</p><Link className="button button-primary" to="/algorithms">返回算法训练</Link></div></div>;

  return <div className="page-stack algorithm-problem-page"><Link className="back-link" to="/algorithms/history"><ArrowLeftIcon aria-hidden="true" size={17} />训练历史</Link><header className="algorithm-problem-header"><div><div className="problem-meta-row"><span className={`difficulty-badge difficulty-${problem.difficulty}`}>{problem.difficulty}</span>{problem.topics.map((topic) => <span className="topic-token" key={topic}>{topic}</span>)}</div><h1>{problem.title_zh || problem.title}</h1><p>{problem.title} · {problem.source_lists.join(" / ") || "本地题库"}</p></div><a className="button button-secondary" href={problem.url} rel="noreferrer" target="_blank">打开原题<ArrowSquareOutIcon aria-hidden="true" size={16} /></a></header>{error ? <p className="field-error page-error" role="alert">{error}</p> : null}<div className="algorithm-problem-grid"><section><div className="section-heading"><div><span className="pane-label">历史记录</span><h2>多次尝试</h2></div><span>{attempts.length} 次</span></div>{attempts.length ? <div className="problem-attempt-list">{attempts.map((attempt) => <article key={attempt.id}><div><span className="pane-label">{formatDate(attempt.created_at)} · {attempt.result}</span><h3>{attempt.approach || "未记录思路"}</h3><p>{attempt.reflection || attempt.mistakes || "没有附加反思。"}</p></div><div className="problem-attempt-meta"><span><ClockIcon aria-hidden="true" size={15} />{attempt.duration_seconds ? `${Math.ceil(attempt.duration_seconds / 60)} 分` : "未计时"}</span><button className="text-danger-button" onClick={() => setPendingDelete(attempt)} type="button">删除</button></div></article>)}</div> : <div className="empty-state"><p>还没有这道题的尝试记录。</p><Link className="button button-primary" to="/algorithms">开始训练</Link></div>}</section><aside className="similar-problem-panel"><div className="section-heading"><div><span className="pane-label">本地候选</span><h2>相似题</h2></div></div><p>根据主题、难度和题单重叠计算，不由 AI 虚构题目。</p>{similar.map((item) => <Link className="similar-problem-link" key={item.id} to={`/algorithms/problems/${item.id}`}><span>{item.title_zh || item.title}</span><small>{item.topics.join(" · ")}</small></Link>)}</aside></div><ConfirmActionDialog confirmLabel="确认删除" danger description="这会删除本次解题记录，不会删除题库原题或其他尝试。" isConfirming={isDeleting} onCancel={() => setPendingDelete(null)} onConfirm={() => void removeAttempt()} open={pendingDelete !== null} title="删除解题记录" /></div>;
}
