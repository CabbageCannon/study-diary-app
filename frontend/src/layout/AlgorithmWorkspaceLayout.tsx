import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { getAlgorithmStats, peekAlgorithmStats } from "../api/algorithms";
import { AlgorithmOverviewBar } from "../components/algorithms/AlgorithmOverviewBar";
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
        <AlgorithmOverviewBar stats={stats} />
      </header>
      <AlgorithmSubNavigation />
      <div className="algorithm-workspace-content">
        <Outlet />
      </div>
    </div>
  );
}
