import { type ReactNode, useCallback, useEffect, useState } from "react";

import { getInterviewTrainingStats, peekInterviewTrainingStats } from "../api/interviews";
import { InterviewSubNavigation } from "../components/interview/InterviewSubNavigation";
import { SwipeRoutePager } from "../components/SwipeRoutePager";
import type { InterviewTrainingStats } from "../types/interview";

const interviewRoutes = ["/interview", "/interview/setup", "/interview/history"] as const;

export function InterviewWorkspaceLayout({ pages }: { pages: readonly ReactNode[] }) {
  const [stats, setStats] = useState<InterviewTrainingStats | null>(() => peekInterviewTrainingStats());
  const loadStats = useCallback(async () => {
    try { setStats(await getInterviewTrainingStats()); }
    catch { /* Keep cached stats visible. */ }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  return <SwipeRoutePager
    ariaLabel="八股子页面"
    className="page-stack interview-workspace-page"
    contentClassName="interview-workspace-content"
    pages={pages}
    routes={interviewRoutes}
  >
    <header className="interview-workspace-header">
      <h1>八股训练</h1>
      <p>{stats ? `连续 ${stats.streak_days} 天 · 今日 ${stats.today_answered_count} 题 · 累计 ${stats.total_answered_count} 题 · 待复习 ${stats.due_review_count} 题` : "训练状态正在同步"}</p>
    </header>
    <InterviewSubNavigation />
  </SwipeRoutePager>;
}
