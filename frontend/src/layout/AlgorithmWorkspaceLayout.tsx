import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { getAlgorithmStats, peekAlgorithmStats } from "../api/algorithms";
import { AlgorithmSubNavigation } from "../components/algorithms/AlgorithmSubNavigation";
import type { AlgorithmStats } from "../types/algorithm";

export function AlgorithmWorkspaceLayout() {
  const { pathname } = useLocation();
  const [stats, setStats] = useState<AlgorithmStats | null>(() => peekAlgorithmStats());

  const loadStats = useCallback(async () => {
    try {
      setStats(await getAlgorithmStats());
    } catch {
      // Keep cached stats visible.
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats, pathname]);

  return (
    <div className="page-stack algorithm-workspace-page">
      <header className="algorithm-workspace-header">
        <h1>算法训练</h1>
        <p>{stats ? `连续 ${stats.current_streak_days} 天 · 今日 ${stats.today_completed_count} 题 · 累计 ${stats.unique_solved_count} 题 · 待复习 ${stats.due_review_count} 题` : "训练状态正在同步"}</p>
      </header>
      <AlgorithmSubNavigation />
      <div className="algorithm-workspace-content">
        <Outlet />
      </div>
    </div>
  );
}
