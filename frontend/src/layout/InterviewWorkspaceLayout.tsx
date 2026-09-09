import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { getInterviewTrainingStats } from "../api/interviews";
import { InterviewSubNavigation } from "../components/interview/InterviewSubNavigation";
import type { InterviewTrainingStats } from "../types/interview";

export interface InterviewWorkspaceContext {
  stats: InterviewTrainingStats | null;
}

export function InterviewWorkspaceLayout() {
  const { pathname } = useLocation();
  const [stats, setStats] = useState<InterviewTrainingStats | null>(null);
  const loadStats = useCallback(async () => {
    try { setStats(await getInterviewTrainingStats()); }
    catch { setStats(null); }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats, pathname]);

  return <div className="page-stack interview-workspace-page">
    <header className="interview-workspace-header">
      <div><span className="page-kicker">学习工作区</span><h1>八股训练</h1></div>
      <p>{stats ? `连续 ${stats.streak_days} 天 · 今日 ${stats.today_answered_count} 题 · 累计 ${stats.total_answered_count} 题 · 待复习 ${stats.due_review_count} 题` : "训练状态正在同步"}</p>
    </header>
    <InterviewSubNavigation />
    <div className="interview-workspace-content"><Outlet context={{ stats } satisfies InterviewWorkspaceContext} /></div>
  </div>;
}
