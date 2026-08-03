import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TargetIcon } from "@phosphor-icons/react/Target";

import { createAlgorithmReviewSession, getAlgorithmWeaknesses, listDueAlgorithmReviews } from "../api/algorithms";
import type { AlgorithmReviewSchedule, AlgorithmWeakness } from "../types/algorithm";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

export function AlgorithmReviewPage() {
  const navigate = useNavigate();
  const [dueReviews, setDueReviews] = useState<AlgorithmReviewSchedule[]>([]);
  const [weaknesses, setWeaknesses] = useState<AlgorithmWeakness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [due, weaknessData] = await Promise.all([listDueAlgorithmReviews(), getAlgorithmWeaknesses()]);
      setDueReviews(due);
      setWeaknesses(weaknessData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "复习队列加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function startReview() {
    setIsCreating(true);
    setError("");
    try {
      const session = await createAlgorithmReviewSession(Math.min(Math.max(dueReviews.length, 1), 5));
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建复习训练失败。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="page-stack algorithm-review-page">
      <header className="page-header"><div><span className="page-kicker">复习闭环</span><h1>复习队列</h1></div><p>复习日期由真实 Attempt、错误结果和手动标记共同决定。</p></header>
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <section className="algorithm-review-hero"><div><span>今日待复习</span><strong className="tabular-number">{dueReviews.length}</strong><small>题</small></div><button className="button button-primary" disabled={!dueReviews.length || isCreating} onClick={() => void startReview()} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />{isCreating ? "创建中" : "开始复习"}</button></section>
      <div className="algorithm-review-grid"><section className="algorithm-review-list"><div className="section-heading"><div><span className="pane-label">到期与逾期</span><h2>复习题目</h2></div><span>{isLoading ? "读取中" : `${dueReviews.length} 题`}</span></div>{!isLoading && !dueReviews.length ? <div className="empty-state"><p>今天没有到期复习题目。</p><Link className="button button-secondary" to="/algorithms">继续练习</Link></div> : null}{dueReviews.map((item) => <article className="algorithm-review-item" key={item.problem.id}><div><span className="pane-label">{item.reason === "wrong" ? "错题复习" : item.reason === "ai_feedback" ? "AI 建议复习" : "间隔复习"}</span><h3>{item.problem.title_zh || item.problem.title}</h3><p>{item.problem.topics.join(" · ")} · 上次 {item.last_attempt?.result ?? "未记录"}</p></div><div><time>{formatDate(item.next_review_at)}</time><Link aria-label={`查看 ${item.problem.title} 详情`} to={`/algorithms/problems/${item.problem.id}`}><ArrowRightIcon aria-hidden="true" size={18} /></Link></div></article>)}</section>
        <section className="algorithm-weakness-panel"><div className="section-heading"><div><span className="pane-label">真实 Attempt</span><h2>薄弱点</h2></div><TargetIcon aria-hidden="true" size={20} weight="bold" /></div>{weaknesses.length ? <div className="weakness-list">{weaknesses.slice(0, 6).map((item) => <article key={item.topic}><div><strong>{item.topic}</strong><small>{item.attempt_count} 次尝试 · 成功率 {Math.round(item.success_rate * 100)}%</small></div><span className="tabular-number">{item.mastery_score}</span></article>)}</div> : <p className="algorithm-muted-copy">完成或记录几次题目后，这里会显示可解释的薄弱点。</p>}</section></div>
    </div>
  );
}
