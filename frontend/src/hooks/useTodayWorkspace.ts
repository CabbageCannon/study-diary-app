import { useCallback, useEffect, useState } from "react";

import { getAlgorithmDailyFeed, getAlgorithmStats, listAlgorithmSessions } from "../api/algorithms";
import { getDesktopPetDashboard } from "../api/desktopPet";
import { getInterviewTrainingStats, listInterviewQuestionSets } from "../api/interviews";
import type { AlgorithmDailyFeed, AlgorithmSessionSummary, AlgorithmStats } from "../types/algorithm";
import type { DesktopPetDashboard } from "../types/desktopPet";
import type { InterviewQuestionSetSummary, InterviewTrainingStats } from "../types/interview";

export interface TodayWorkspaceData {
  desktopPet: DesktopPetDashboard | null;
  algorithmFeed: AlgorithmDailyFeed | null;
  algorithmStats: AlgorithmStats | null;
  algorithmSessions: AlgorithmSessionSummary[];
  interviewStats: InterviewTrainingStats | null;
  interviewSessions: InterviewQuestionSetSummary[];
}

const emptyData: TodayWorkspaceData = {
  desktopPet: null,
  algorithmFeed: null,
  algorithmStats: null,
  algorithmSessions: [],
  interviewStats: null,
  interviewSessions: [],
};

export function useTodayWorkspace() {
  const [data, setData] = useState<TodayWorkspaceData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [failedSectionCount, setFailedSectionCount] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const results = await Promise.allSettled([
        getDesktopPetDashboard(controller.signal),
        getAlgorithmDailyFeed(),
        getAlgorithmStats(),
        listAlgorithmSessions("in_progress"),
        getInterviewTrainingStats(controller.signal),
        listInterviewQuestionSets({ status: "in_progress", limit: 12, signal: controller.signal }),
      ]);
      if (cancelled) return;

      const [desktopPet, algorithmFeed, algorithmStats, algorithmSessions, interviewStats, interviewSessions] = results;
      setData({
        desktopPet: desktopPet.status === "fulfilled" ? desktopPet.value : null,
        algorithmFeed: algorithmFeed.status === "fulfilled" ? algorithmFeed.value : null,
        algorithmStats: algorithmStats.status === "fulfilled" ? algorithmStats.value : null,
        algorithmSessions: algorithmSessions.status === "fulfilled" ? algorithmSessions.value : [],
        interviewStats: interviewStats.status === "fulfilled" ? interviewStats.value : null,
        interviewSessions: interviewSessions.status === "fulfilled" ? interviewSessions.value : [],
      });
      setFailedSectionCount(results.filter((result) => result.status === "rejected").length);
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshVersion]);

  return { data, failedSectionCount, isLoading, refresh };
}
