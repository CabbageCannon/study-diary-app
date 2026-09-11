import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TargetIcon } from "@phosphor-icons/react/Target";

import { createAlgorithmReviewSession, getAlgorithmWeaknesses, listAlgorithmReviewCandidates } from "../api/algorithms";
import type { AlgorithmReviewCandidate, AlgorithmWeakness } from "../types/algorithm";

type AccuracyFilter = "all" | "weak" | "partial" | "high";
type TimeOrder = "recommended" | "recent" | "older";

const resultLabels = { solved: "已解出", partially_solved: "部分正确", failed: "未通过", gave_up: "放弃" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function accuracyBounds(value: AccuracyFilter) {
  if (value === "weak") return { max_accuracy: 69 };
  if (value === "partial") return { min_accuracy: 70, max_accuracy: 89 };
  if (value === "high") return { min_accuracy: 90 };
  return {};
}

export function AlgorithmReviewPage() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<AlgorithmReviewCandidate[]>([]);
  const [weaknesses, setWeaknesses] = useState<AlgorithmWeakness[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [timeOrder, setTimeOrder] = useState<TimeOrder>("recommended");
  const [accuracy, setAccuracy] = useState<AccuracyFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [reviewData, weaknessData] = await Promise.all([
        listAlgorithmReviewCandidates({ time_order: timeOrder, from_date: fromDate, to_date: toDate, ...accuracyBounds(accuracy), limit: 50 }),
        getAlgorithmWeaknesses(),
      ]);
      setCandidates(reviewData);
      setSelectedIds((current) => current.filter((id) => reviewData.some((item) => item.problem.id === id)));
      setWeaknesses(weaknessData);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "复习候选加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [accuracy, fromDate, timeOrder, toDate]);

  useEffect(() => { void load(); }, [load]);

  function toggleProblem(problemId: number) {
    setSelectedIds((current) => current.includes(problemId) ? current.filter((id) => id !== problemId) : [...current, problemId].slice(0, 20));
  }

  async function startReview() {
    if (!selectedIds.length) return;
    setIsCreating(true);
    setError("");
    try {
      const session = await createAlgorithmReviewSession({ problem_ids: selectedIds, count: selectedIds.length });
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建复习训练失败。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="algorithm-workspace-panel algorithm-review-page">
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      <section className="algorithm-review-hero"><div><span>可复习</span><strong className="tabular-number">{candidates.length}</strong><small>题来自已有记录</small></div><button className="button button-primary" disabled={!selectedIds.length || isCreating} onClick={() => void startReview()} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />{isCreating ? "创建中" : `复习 ${selectedIds.length} 题`}</button></section>
      <div className="algorithm-review-grid"><section className="algorithm-review-list"><div className="section-heading"><div><span className="pane-label">Attempt 记录</span><h2>复习候选</h2></div><span>{isLoading ? "读取中" : `${selectedIds.length}/${candidates.length} 已选`}</span></div><div className="algorithm-review-filters"><label><span>排序</span><select value={timeOrder} onChange={(event) => setTimeOrder(event.target.value as TimeOrder)}><option value="recommended">推荐</option><option value="recent">最近练习</option><option value="older">较早练习</option></select></label><label><span>正确度</span><select value={accuracy} onChange={(event) => setAccuracy(event.target.value as AccuracyFilter)}><option value="all">全部</option><option value="weak">低于 70</option><option value="partial">70-89</option><option value="high">90 以上</option></select></label><label><span>从</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label><span>到</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div>{!isLoading && !candidates.length ? <div className="empty-state"><p>没有符合筛选的已做题。</p><Link className="button button-secondary" to="/algorithms">继续练习</Link></div> : null}{candidates.map((item) => <article className="algorithm-review-item" key={item.problem.id}><label className="algorithm-review-check"><input checked={selectedIds.includes(item.problem.id)} onChange={() => toggleProblem(item.problem.id)} type="checkbox" /><span><span className="pane-label">{item.status === "needs_review" ? "建议复习" : "完成记录"}</span><strong>{item.problem.title_zh || item.problem.title}</strong><small>{item.problem.topics.join(" · ")} · {resultLabels[item.last_attempt.result]} · 正确度 {item.accuracy_score}</small></span></label><div><time>{formatDate(item.last_practiced_at)}</time><Link aria-label={`查看 ${item.problem.title} 详情`} to={`/algorithms/problems/${item.problem.id}`}><ArrowRightIcon aria-hidden="true" size={18} /></Link></div></article>)}</section>
        <section className="algorithm-weakness-panel"><div className="section-heading"><div><span className="pane-label">真实 Attempt</span><h2>薄弱点</h2></div><TargetIcon aria-hidden="true" size={20} weight="bold" /></div>{weaknesses.length ? <div className="weakness-list">{weaknesses.slice(0, 6).map((item) => <article key={item.topic}><div><strong>{item.topic}</strong><small>{item.attempt_count} 次尝试 · 成功率 {Math.round(item.success_rate * 100)}%</small></div><span className="tabular-number">{item.mastery_score}</span></article>)}</div> : <p className="algorithm-muted-copy">完成或记录几次题目后，这里会显示可解释的薄弱点。</p>}</section></div>
    </div>
  );
}
