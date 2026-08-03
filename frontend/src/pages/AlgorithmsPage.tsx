import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { ChartBarIcon } from "@phosphor-icons/react/ChartBar";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";

import {
  createAlgorithmReviewSession,
  createAlgorithmSession,
  getAlgorithmStats,
  getDailyAlgorithmProblem,
  listAlgorithmProblems,
  listAlgorithmSessions,
} from "../api/algorithms";
import type { AlgorithmDifficulty, AlgorithmProblem, AlgorithmSessionSummary, AlgorithmStats, AlgorithmTrainingMode } from "../types/algorithm";

const modeOptions: { mode: AlgorithmTrainingMode; label: string; detail: string }[] = [
  { mode: "daily", label: "每日一题", detail: "同一天固定返回同一道本地题目" },
  { mode: "hot100", label: "Hot 100", detail: "从本地登记的 Hot 100 子集中选择" },
  { mode: "topic", label: "按题型", detail: "围绕一个主题建立训练" },
  { mode: "difficulty", label: "按难度", detail: "集中练习一个难度层级" },
  { mode: "random", label: "随机", detail: "固定题序，刷新不会重抽" },
  { mode: "weakness", label: "薄弱点", detail: "基于真实 Attempt 与复习状态" },
  { mode: "wrong", label: "错题", detail: "优先处理失败和待复习题目" },
  { mode: "similar", label: "相似题", detail: "从本地题库中选择主题接近的题目" },
  { mode: "custom", label: "自选题", detail: "从已验证的本地题库中挑选题目" },
];

function difficultyLabel(difficulty: AlgorithmDifficulty) {
  return { easy: "简单", medium: "中等", hard: "困难" }[difficulty];
}

function modeLabel(mode: AlgorithmTrainingMode) {
  return modeOptions.find((item) => item.mode === mode)?.label ?? (mode === "review" ? "今日复习" : "自定义训练");
}

export function AlgorithmsPage() {
  const navigate = useNavigate();
  const [daily, setDaily] = useState<AlgorithmProblem | null>(null);
  const [stats, setStats] = useState<AlgorithmStats | null>(null);
  const [sessions, setSessions] = useState<AlgorithmSessionSummary[]>([]);
  const [problems, setProblems] = useState<AlgorithmProblem[]>([]);
  const [mode, setMode] = useState<AlgorithmTrainingMode>("daily");
  const [topic, setTopic] = useState("");
  const [referenceProblemId, setReferenceProblemId] = useState("");
  const [customProblemIds, setCustomProblemIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<AlgorithmDifficulty>("medium");
  const [count, setCount] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [dailyProblem, statsData, sessionData, catalog] = await Promise.all([
        getDailyAlgorithmProblem(),
        getAlgorithmStats(),
        listAlgorithmSessions("in_progress"),
        listAlgorithmProblems({ limit: 100 }),
      ]);
      setDaily(dailyProblem);
      setStats(statsData);
      setSessions(sessionData);
      setProblems(catalog);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "算法训练数据加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topics = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort(), [problems]);
  const currentMode = modeOptions.find((item) => item.mode === mode) ?? modeOptions[0];
  const resumeSession = sessions[0];

  async function startSession(nextMode = mode) {
    setIsCreating(true);
    setError("");
    try {
      const session = nextMode === "review"
        ? await createAlgorithmReviewSession(count)
        : await createAlgorithmSession({
          mode: nextMode,
          count: nextMode === "daily" ? 1 : count,
          topics: nextMode === "topic" && topic ? [topic] : undefined,
          difficulty: nextMode === "difficulty" ? [difficulty] : undefined,
          reference_problem_id: nextMode === "similar" ? referenceProblemId || undefined : undefined,
          problem_ids: nextMode === "custom" ? customProblemIds : undefined,
          prioritize_due_review: nextMode !== "random",
        });
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建算法训练失败。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="page-stack algorithm-home-page">
      <header className="page-header algorithm-page-header">
        <div><span className="page-kicker">本地题库 · 训练记录</span><h1>算法训练</h1></div>
        <p>用固定题序记录思路、用时和复习，而不是模拟在线判题。</p>
      </header>

      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}

      <section className="algorithm-hero-grid" aria-label="算法训练概览">
        <article className="daily-problem-panel">
          <div className="daily-problem-heading"><span>今日一题</span><SparkleIcon aria-hidden="true" size={18} weight="fill" /></div>
          {daily ? <><h2>{daily.title_zh || daily.title}</h2><p>{daily.title_zh ? daily.title : daily.slug}</p><div className="metadata-row"><span className={`difficulty-badge difficulty-${daily.difficulty}`}>{difficultyLabel(daily.difficulty)}</span>{daily.topics.map((item) => <span className="topic-token" key={item}>{item}</span>)}</div><button className="button button-primary" disabled={isCreating} onClick={() => void startSession("daily")} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />开始今日训练</button></> : <p>{isLoading ? "正在选择本地题目…" : "题库暂时没有可用题目。"}</p>}
        </article>
        <section className="algorithm-stat-strip" aria-label="训练数据">
          <div><span>连续</span><strong className="tabular-number">{stats?.current_streak_days ?? 0}</strong><small>天</small></div>
          <div><span>今日完成</span><strong className="tabular-number">{stats?.today_completed_count ?? 0}</strong><small>题</small></div>
          <div><span>待复习</span><strong className="tabular-number">{stats?.due_review_count ?? 0}</strong><small>题</small></div>
          <Link className="algorithm-inline-link" to="/algorithms/review">复习队列<ArrowRightIcon aria-hidden="true" size={16} /></Link>
        </section>
      </section>

      {resumeSession ? <section className="resume-training-band"><div><span>未完成训练</span><strong>{modeLabel(resumeSession.mode)} · {resumeSession.solved_count}/{resumeSession.question_count} 已完成</strong></div><button className="button button-secondary" onClick={() => navigate(`/algorithms/session/${resumeSession.id}`)} type="button">继续</button></section> : null}

      <section className="algorithm-mode-workbench" aria-labelledby="algorithm-mode-title">
        <div className="section-heading"><div><span className="pane-label">训练计划</span><h2 id="algorithm-mode-title">选择方式</h2></div><Link className="algorithm-inline-link" to="/algorithms/history"><ClockCounterClockwiseIcon aria-hidden="true" size={17} />训练历史</Link></div>
        <div className="algorithm-mode-grid">
          {modeOptions.map((option) => <button className={mode === option.mode ? "algorithm-mode-option algorithm-mode-option-active" : "algorithm-mode-option"} key={option.mode} onClick={() => setMode(option.mode)} type="button"><strong>{option.label}</strong><small>{option.detail}</small></button>)}
        </div>
        <div className="algorithm-mode-config">
          <div><span className="pane-label">当前方式</span><strong>{currentMode.label}</strong><small>{currentMode.detail}</small></div>
          {mode === "topic" ? <label><span>题型</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">全部题型</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
          {mode === "similar" ? <label><span>参考题</span><select value={referenceProblemId} onChange={(event) => setReferenceProblemId(event.target.value)}><option value="">选择本地题目</option>{problems.map((item) => <option key={item.id} value={item.id}>{item.title_zh || item.title}</option>)}</select></label> : null}
          {mode === "custom" ? <label className="algorithm-custom-problem-picker"><span>选择题目</span><select multiple size={4} value={customProblemIds} onChange={(event) => setCustomProblemIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{problems.map((item) => <option key={item.id} value={item.id}>{item.title_zh || item.title}</option>)}</select><small>按住 Ctrl 或 Command 可多选</small></label> : null}
          {mode === "difficulty" ? <label><span>难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as AlgorithmDifficulty)}>{(["easy", "medium", "hard"] as const).map((item) => <option key={item} value={item}>{difficultyLabel(item)}</option>)}</select></label> : null}
          {mode !== "daily" ? <label><span>题数</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 5, 8, 10].map((value) => <option key={value} value={value}>{value} 题</option>)}</select></label> : null}
          <button className="button button-primary" disabled={isCreating || isLoading || (mode === "similar" && !referenceProblemId) || (mode === "custom" && !customProblemIds.length)} onClick={() => void startSession()} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />创建训练</button>
        </div>
      </section>

      <section className="algorithm-home-lower">
        <article className="algorithm-insight-panel"><div className="section-heading"><div><span className="pane-label">真实记录</span><h2>学习概况</h2></div><ChartBarIcon aria-hidden="true" size={20} weight="bold" /></div><dl><div><dt>累计尝试</dt><dd className="tabular-number">{stats?.total_attempt_count ?? 0}</dd></div><div><dt>完成题目</dt><dd className="tabular-number">{stats?.unique_solved_count ?? 0}</dd></div><div><dt>平均用时</dt><dd className="tabular-number">{stats?.average_duration_seconds ? `${Math.round(stats.average_duration_seconds / 60)} 分` : "-"}</dd></div></dl></article>
        <article className="algorithm-insight-panel"><div className="section-heading"><div><span className="pane-label">当前题库</span><h2>可用题目</h2></div><span className="tabular-number">{problems.length}</span></div><p>当前为本地维护的示例子集。扩充后仍会沿用相同的确定性选题与记录规则。</p><Link className="algorithm-inline-link" to="/algorithms/history">查看记录<ArrowRightIcon aria-hidden="true" size={16} /></Link></article>
      </section>
    </div>
  );
}
