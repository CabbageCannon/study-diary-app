import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAlgorithmDailyFeed, createAlgorithmSession, getAlgorithmStats, listAlgorithmProblems, listAlgorithmSessions, peekAlgorithmDailyFeed, peekAlgorithmProblems, peekAlgorithmSessions, peekAlgorithmStats, refreshAlgorithmDailyFeed } from "../api/algorithms";
import { AlgorithmResumeBanner } from "../components/algorithms/AlgorithmResumeBanner";
import { DailyExtraProblemList } from "../components/algorithms/DailyExtraProblemList";
import { DailyPrimaryProblem } from "../components/algorithms/DailyPrimaryProblem";
import { RefreshDailyRecommendationDialog } from "../components/algorithms/RefreshDailyRecommendationDialog";
import { TemporaryTrainingBuilder } from "../components/algorithms/TemporaryTrainingBuilder";
import { useUserPreferences } from "../hooks/useUserPreferences";
import type { AlgorithmDailyFeed, AlgorithmProblem, AlgorithmSessionSummary, AlgorithmStats, CreateAlgorithmSessionPayload } from "../types/algorithm";

export function AlgorithmsPage() {
  const navigate = useNavigate();
  const [preferences] = useUserPreferences();
  const problemFilters = useMemo(() => ({ limit: 60 }), []);
  const [feed, setFeed] = useState<AlgorithmDailyFeed | null>(() => peekAlgorithmDailyFeed());
  const [sessions, setSessions] = useState<AlgorithmSessionSummary[]>(() => peekAlgorithmSessions() ?? []);
  const [stats, setStats] = useState<AlgorithmStats | null>(() => peekAlgorithmStats());
  const [problems, setProblems] = useState<AlgorithmProblem[]>(() => peekAlgorithmProblems(problemFilters) ?? []);
  const [isLoading, setIsLoading] = useState(() => !peekAlgorithmDailyFeed());
  const [isCreatingDaily, setIsCreatingDaily] = useState(false);
  const [isCreatingTemporary, setIsCreatingTemporary] = useState(false);
  const [isLoadingProblems, setIsLoadingProblems] = useState(false);
  const [creatingExtraProblemId, setCreatingExtraProblemId] = useState<number | null>(null);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(!peekAlgorithmDailyFeed());
    setError("");
    try {
      const [nextFeed, nextSessions, nextStats] = await Promise.all([getAlgorithmDailyFeed(), listAlgorithmSessions(), getAlgorithmStats()]);
      setFeed(nextFeed);
      setSessions(nextSessions);
      setStats(nextStats);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "今日算法训练加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeDailySession = useMemo(() => sessions.find((session) => session.status === "in_progress" && session.mode === "daily"), [sessions]);
  const resumeSession = useMemo(() => sessions.find((session) => session.status === "in_progress"), [sessions]);
  const hasExistingLearning = Boolean(feed && (feed.primary_problem_attempt_count > 0 || sessions.some((session) => session.mode === "daily" && session.started_at.startsWith(feed.date))));
  const dailyGoal = preferences.dailyGoals.algorithm;
  const todayCompleted = stats?.today_completed_count ?? 0;
  const remainingToday = Math.max(0, dailyGoal - todayCompleted);

  async function startDailyTraining() {
    if (!feed || isCreatingDaily) return;
    if (activeDailySession) {
      navigate(`/algorithms/session/${activeDailySession.id}`);
      return;
    }
    setIsCreatingDaily(true);
    setError("");
    try {
      const count = Math.max(1, remainingToday || dailyGoal || 1);
      const problemIds = [feed.primary_problem, ...feed.extra_problems].slice(0, count).map((problem) => String(problem.id));
      const session = await createAlgorithmSession({ mode: "daily", count, problem_ids: problemIds, prioritize_due_review: true });
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建今日训练失败。");
    } finally {
      setIsCreatingDaily(false);
    }
  }

  async function startExtraTraining(problem: AlgorithmProblem) {
    if (creatingExtraProblemId !== null) return;
    setCreatingExtraProblemId(problem.id);
    setError("");
    try {
      const session = await createAlgorithmSession({ mode: "custom", count: 1, problem_ids: [String(problem.id)], prioritize_due_review: false });
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建单题训练失败。");
    } finally {
      setCreatingExtraProblemId(null);
    }
  }

  async function refreshFeed() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError("");
    try {
      setFeed(await refreshAlgorithmDailyFeed());
      setRefreshDialogOpen(false);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "刷新今日推荐失败。");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function ensureProblemsLoaded() {
    if (problems.length || isLoadingProblems) return;
    setIsLoadingProblems(true);
    try {
      setProblems(await listAlgorithmProblems(problemFilters));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "题库加载失败。");
    } finally {
      setIsLoadingProblems(false);
    }
  }

  async function createTemporaryTraining(payload: CreateAlgorithmSessionPayload) {
    if (isCreatingTemporary) return;
    setIsCreatingTemporary(true);
    setError("");
    try {
      const session = await createAlgorithmSession(payload);
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建指定训练失败。");
    } finally {
      setIsCreatingTemporary(false);
    }
  }

  return <div className="algorithm-workspace-panel algorithm-home-page algorithm-daily-page">{error ? <p className="field-error page-error" role="alert">{error}</p> : null}{resumeSession ? <AlgorithmResumeBanner onResume={() => navigate(`/algorithms/session/${resumeSession.id}`)} session={resumeSession} /> : null}{isLoading ? <section className="daily-feed-skeleton" aria-label="正在加载今日推荐"><div className="skeleton-block" /><div className="skeleton-block" /></section> : null}{feed ? <section className="daily-feed-layout" aria-label="今日训练推荐">{remainingToday === 0 ? <section className="daily-primary-problem"><div className="daily-primary-heading"><span>今日算法已完成</span></div><h2>今日算法已完成</h2><p className="daily-strategy-summary">已完成 {todayCompleted} / {dailyGoal} 题。还想加练的话，右侧继续刷会保留。</p></section> : <DailyPrimaryProblem feed={feed} isCreating={isCreatingDaily} onStart={() => void startDailyTraining()} remainingCount={remainingToday} />}<aside className="daily-continuation-panel" aria-labelledby="daily-continuation-title"><h2 id="daily-continuation-title">继续刷</h2><DailyExtraProblemList creatingProblemId={creatingExtraProblemId} isRefreshing={isRefreshing} onRefresh={() => setRefreshDialogOpen(true)} onStart={(problem) => void startExtraTraining(problem)} problems={feed.extra_problems} /><TemporaryTrainingBuilder eyebrow={isLoadingProblems ? "同步题库中" : "按偏好创建"} isCreating={isCreatingTemporary} onCreate={(payload) => void createTemporaryTraining(payload)} onOpen={() => void ensureProblemsLoaded()} title="指定偏好" problems={problems} /></aside></section> : null}<RefreshDailyRecommendationDialog hasExistingLearning={hasExistingLearning} isRefreshing={isRefreshing} onCancel={() => setRefreshDialogOpen(false)} onConfirm={() => void refreshFeed()} open={refreshDialogOpen} /></div>;
}
