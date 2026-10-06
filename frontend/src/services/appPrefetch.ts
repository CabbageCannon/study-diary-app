import { getAlgorithmDailyFeed, getAlgorithmSession, getAlgorithmStats, listAlgorithmSessions, prefetchAlgorithmSettingsData } from "../api/algorithms";
import { getAlgorithmReasoningContext } from "../api/algorithmReasoning";
import { listDiaries } from "../api/client";
import {
  getInterviewQuestionSet,
  getInterviewTrainingStats,
  listInterviewQuestionSets,
} from "../api/interviews";

export async function prefetchAppData() {
  const recentSetsPromise = listInterviewQuestionSets({ limit: 3, force: true });
  const activeSetsPromise = listInterviewQuestionSets({ status: "in_progress", limit: 12, force: true });

  const results = await Promise.allSettled([
    getAlgorithmDailyFeed(true),
    getAlgorithmStats(true),
    listAlgorithmSessions(undefined, true),
    listAlgorithmSessions("in_progress", true),
    getInterviewTrainingStats(undefined, true),
    listDiaries(true),
    recentSetsPromise,
    activeSetsPromise,
    prefetchAlgorithmSettingsData(true),
  ]);

  const detailIds = new Set<number>();
  const recentSets = results[6];
  const activeSets = results[7];
  if (recentSets.status === "fulfilled") recentSets.value.forEach((item) => detailIds.add(item.id));
  if (activeSets.status === "fulfilled") activeSets.value.forEach((item) => detailIds.add(item.id));
  const algorithmSessionIds = new Set<string>();
  const allAlgorithmSessions = results[2];
  const activeAlgorithmSessions = results[3];
  if (allAlgorithmSessions.status === "fulfilled") allAlgorithmSessions.value.filter((item) => item.status === "in_progress").forEach((item) => algorithmSessionIds.add(item.id));
  if (activeAlgorithmSessions.status === "fulfilled") activeAlgorithmSessions.value.forEach((item) => algorithmSessionIds.add(item.id));

  const algorithmProblemIds = new Set<number>();
  const feed = results[0];
  if (feed.status === "fulfilled") {
    algorithmProblemIds.add(feed.value.primary_problem.id);
    feed.value.extra_problems.forEach((problem) => algorithmProblemIds.add(problem.id));
  }

  await Promise.allSettled([
    ...[...detailIds].map((id) => getInterviewQuestionSet(id, undefined, true)),
    ...[...algorithmSessionIds].map((id) => getAlgorithmSession(id, true)),
    ...[...algorithmProblemIds].map((id) => getAlgorithmReasoningContext(id)),
  ]);
}
