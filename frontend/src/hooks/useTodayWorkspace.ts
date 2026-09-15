import { useCallback, useEffect, useState } from "react";

import { listDiaries, peekDiaries } from "../api/client";
import { getAlgorithmStats, listAlgorithmSessions, peekAlgorithmSessions, peekAlgorithmStats } from "../api/algorithms";
import { getInterviewTrainingStats, listInterviewQuestionSets, peekInterviewQuestionSets, peekInterviewTrainingStats } from "../api/interviews";
import type { AlgorithmSessionSummary, AlgorithmStats } from "../types/algorithm";
import type { InterviewQuestionSetSummary, InterviewTrainingStats } from "../types/interview";
import { getShanghaiDateKey } from "../services/userPreferences";

export interface TodayWorkspaceData {
  algorithmStats: AlgorithmStats | null;
  algorithmSessions: AlgorithmSessionSummary[];
  interviewStats: InterviewTrainingStats | null;
  interviewSessions: InterviewQuestionSetSummary[];
  todayDiaryCount: number;
}

function readCachedWorkspace(): TodayWorkspaceData {
  const diaries = peekDiaries() ?? [];
  const todayKey = getShanghaiDateKey();
  return {
    algorithmStats: peekAlgorithmStats(),
    algorithmSessions: peekAlgorithmSessions("in_progress") ?? [],
    interviewStats: peekInterviewTrainingStats(),
    interviewSessions: peekInterviewQuestionSets({ status: "in_progress", limit: 12 }) ?? [],
    todayDiaryCount: diaries.filter((diary) => diary.date === todayKey && diary.status === "published").length,
  };
}

export function useTodayWorkspace() {
  const [data, setData] = useState<TodayWorkspaceData>(() => readCachedWorkspace());
  const [isLoading, setIsLoading] = useState(() => !peekAlgorithmStats() && !peekInterviewTrainingStats());
  const [failedSectionCount, setFailedSectionCount] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const results = await Promise.allSettled([
        getAlgorithmStats(),
        listAlgorithmSessions("in_progress"),
        getInterviewTrainingStats(controller.signal),
        listInterviewQuestionSets({ status: "in_progress", limit: 12, signal: controller.signal }),
        listDiaries(),
      ]);
      if (cancelled) return;

      const [algorithmStats, algorithmSessions, interviewStats, interviewSessions, diaries] = results;
      const todayKey = getShanghaiDateKey();
      setData({
        algorithmStats: algorithmStats.status === "fulfilled" ? algorithmStats.value : null,
        algorithmSessions: algorithmSessions.status === "fulfilled" ? algorithmSessions.value : [],
        interviewStats: interviewStats.status === "fulfilled" ? interviewStats.value : null,
        interviewSessions: interviewSessions.status === "fulfilled" ? interviewSessions.value : [],
        todayDiaryCount: diaries.status === "fulfilled" ? diaries.value.filter((diary) => diary.date === todayKey && diary.status === "published").length : 0,
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
