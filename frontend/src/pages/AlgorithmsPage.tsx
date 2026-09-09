import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAlgorithmDailyFeed, createAlgorithmSession, listAlgorithmSessions, peekAlgorithmDailyFeed, peekAlgorithmSessions, refreshAlgorithmDailyFeed } from "../api/algorithms";
import { AlgorithmResumeBanner } from "../components/algorithms/AlgorithmResumeBanner";
import { DailyExtraProblemList } from "../components/algorithms/DailyExtraProblemList";
import { DailyPrimaryProblem } from "../components/algorithms/DailyPrimaryProblem";
import { RefreshDailyRecommendationDialog } from "../components/algorithms/RefreshDailyRecommendationDialog";
import type { AlgorithmDailyFeed, AlgorithmProblem, AlgorithmSessionSummary } from "../types/algorithm";

export function AlgorithmsPage() {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<AlgorithmDailyFeed | null>(() => peekAlgorithmDailyFeed());
  const [sessions, setSessions] = useState<AlgorithmSessionSummary[]>(() => peekAlgorithmSessions() ?? []);
  const [isLoading, setIsLoading] = useState(() => !peekAlgorithmDailyFeed());
  const [isCreatingDaily, setIsCreatingDaily] = useState(false);
  const [creatingExtraProblemId, setCreatingExtraProblemId] = useState<number | null>(null);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(!peekAlgorithmDailyFeed());
    setError("");
    try {
      const [nextFeed, nextSessions] = await Promise.all([getAlgorithmDailyFeed(), listAlgorithmSessions()]);
      setFeed(nextFeed);
      setSessions(nextSessions);
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

  async function startDailyTraining() {
    if (!feed || isCreatingDaily) return;
    if (activeDailySession) {
      navigate(`/algorithms/session/${activeDailySession.id}`);
      return;
    }
    setIsCreatingDaily(true);
    setError("");
    try {
      const session = await createAlgorithmSession({ mode: "daily", count: 1, problem_ids: [String(feed.primary_problem.id)], prioritize_due_review: true });
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

  return <div className="algorithm-workspace-panel algorithm-home-page algorithm-daily-page">{error ? <p className="field-error page-error" role="alert">{error}</p> : null}{resumeSession ? <AlgorithmResumeBanner onResume={() => navigate(`/algorithms/session/${resumeSession.id}`)} session={resumeSession} /> : null}{isLoading ? <section className="daily-feed-skeleton" aria-label="正在加载今日推荐"><div className="skeleton-block" /><div className="skeleton-block" /></section> : null}{feed ? <section className="daily-feed-layout" aria-label="今日训练推荐"><DailyPrimaryProblem feed={feed} isCreating={isCreatingDaily} onStart={() => void startDailyTraining()} /><DailyExtraProblemList creatingProblemId={creatingExtraProblemId} isRefreshing={isRefreshing} onRefresh={() => setRefreshDialogOpen(true)} onStart={(problem) => void startExtraTraining(problem)} problems={feed.extra_problems} /></section> : null}<RefreshDailyRecommendationDialog hasExistingLearning={hasExistingLearning} isRefreshing={isRefreshing} onCancel={() => setRefreshDialogOpen(false)} onConfirm={() => void refreshFeed()} open={refreshDialogOpen} /></div>;
}
