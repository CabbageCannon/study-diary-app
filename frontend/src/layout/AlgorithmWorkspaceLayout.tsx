import { type ReactNode, useEffect, useState } from "react";

import { getAlgorithmStats, peekAnyAlgorithmStats } from "../api/algorithms";
import { AlgorithmSubNavigation } from "../components/algorithms/AlgorithmSubNavigation";
import { SwipeRoutePager } from "../components/SwipeRoutePager";
import type { AlgorithmStats } from "../types/algorithm";

let didLoadAlgorithmStats = false;
const algorithmRoutes = ["/algorithms", "/algorithms/review", "/algorithms/history", "/algorithms/settings"] as const;

export function AlgorithmWorkspaceLayout({ pages }: { pages: readonly ReactNode[] }) {
  const [stats, setStats] = useState<AlgorithmStats | null>(() => peekAnyAlgorithmStats());

  useEffect(() => {
    if (didLoadAlgorithmStats) return;
    didLoadAlgorithmStats = true;
    void getAlgorithmStats(true).then(setStats).catch(() => {
      didLoadAlgorithmStats = false;
    });
  }, []);

  return (
    <SwipeRoutePager
      ariaLabel="算法子页面"
      className="page-stack algorithm-workspace-page"
      contentClassName="algorithm-workspace-content"
      pages={pages}
      routes={algorithmRoutes}
    >
      <header className="algorithm-workspace-header">
        <h1>算法训练</h1>
        <p>{stats ? `连续 ${stats.current_streak_days} 天 · 今日 ${stats.today_completed_count} 题 · 累计 ${stats.unique_solved_count} 题 · 待复习 ${stats.due_review_count} 题` : "训练状态正在同步"}</p>
      </header>
      <AlgorithmSubNavigation />
    </SwipeRoutePager>
  );
}
