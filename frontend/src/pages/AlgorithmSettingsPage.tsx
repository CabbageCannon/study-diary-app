import { useCallback, useEffect, useMemo, useState } from "react";

import { getAlgorithmCatalogOverview, getAlgorithmDailySettings, listAlgorithmProblems, peekAlgorithmCatalogOverview, peekAlgorithmDailySettings, peekAlgorithmProblems, updateAlgorithmDailySettings } from "../api/algorithms";
import { AlgorithmCatalogBrowser } from "../components/algorithms/AlgorithmCatalogBrowser";
import { AlgorithmCatalogOverview } from "../components/algorithms/AlgorithmCatalogOverview";
import { DailyRecommendationSettingsForm } from "../components/algorithms/DailyRecommendationSettingsForm";
import type { AlgorithmCatalogOverview as AlgorithmCatalogOverviewType, AlgorithmDailyRecommendationSettings, AlgorithmProblem, UpdateAlgorithmDailyRecommendationSettingsPayload } from "../types/algorithm";

export function AlgorithmSettingsPage() {
  const problemFilters = useMemo(() => ({ limit: 60 }), []);
  const [settings, setSettings] = useState<AlgorithmDailyRecommendationSettings | null>(() => peekAlgorithmDailySettings());
  const [overview, setOverview] = useState<AlgorithmCatalogOverviewType | null>(() => peekAlgorithmCatalogOverview());
  const [problems, setProblems] = useState<AlgorithmProblem[]>(() => peekAlgorithmProblems(problemFilters) ?? []);
  const [isLoading, setIsLoading] = useState(() => !peekAlgorithmDailySettings() || !peekAlgorithmCatalogOverview() || !peekAlgorithmProblems(problemFilters));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(!peekAlgorithmDailySettings() || !peekAlgorithmCatalogOverview() || !peekAlgorithmProblems(problemFilters));
    setError("");
    try {
      const [nextSettings, nextOverview, nextProblems] = await Promise.all([getAlgorithmDailySettings(), getAlgorithmCatalogOverview(), listAlgorithmProblems(problemFilters)]);
      setSettings(nextSettings);
      setOverview(nextOverview);
      setProblems(nextProblems);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练设置加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [problemFilters]);

  useEffect(() => { void load(); }, [load]);
  const topics = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort(), [problems]);
  const sourceLists = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.source_lists))).sort(), [problems]);

  async function saveSettings(payload: UpdateAlgorithmDailyRecommendationSettingsPayload) {
    setIsSaving(true);
    setError("");
    try {
      setSettings(await updateAlgorithmDailySettings(payload));
      setNotice("设置已保存，将用于下一次生成推荐。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存训练设置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="algorithm-workspace-panel algorithm-settings-page">
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
      {notice ? <p className="algorithm-settings-notice" role="status">{notice}</p> : null}
      {isLoading ? <div className="settings-skeleton"><div className="skeleton-block" /><div className="skeleton-block" /></div> : null}
      {settings && overview ? <div className="algorithm-settings-layout">
        <div className="algorithm-settings-main">
          <DailyRecommendationSettingsForm isSaving={isSaving} onSave={(payload) => void saveSettings(payload)} settings={settings} sourceLists={sourceLists} topics={topics} />
        </div>
        <details className="algorithm-catalog-details">
          <summary><span><strong>题库与目录</strong><small>查看来源、专题和已有题目</small></span><b aria-hidden="true">›</b></summary>
          <div className="algorithm-settings-sidebar"><AlgorithmCatalogOverview overview={overview} /><AlgorithmCatalogBrowser problems={problems} /></div>
        </details>
      </div> : null}
    </div>
  );
}
