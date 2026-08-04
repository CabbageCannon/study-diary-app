import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";

import { createAlgorithmSession, getAlgorithmCatalogOverview, getAlgorithmDailySettings, listAlgorithmProblems, refreshAlgorithmDailyFeed, updateAlgorithmDailySettings } from "../api/algorithms";
import { AlgorithmCatalogBrowser } from "../components/algorithms/AlgorithmCatalogBrowser";
import { AlgorithmCatalogOverview } from "../components/algorithms/AlgorithmCatalogOverview";
import { DailyRecommendationSettingsForm } from "../components/algorithms/DailyRecommendationSettingsForm";
import { RefreshDailyRecommendationDialog } from "../components/algorithms/RefreshDailyRecommendationDialog";
import { TemporaryTrainingBuilder } from "../components/algorithms/TemporaryTrainingBuilder";
import type { AlgorithmCatalogOverview as AlgorithmCatalogOverviewType, AlgorithmDailyRecommendationSettings, AlgorithmProblem, CreateAlgorithmSessionPayload, UpdateAlgorithmDailyRecommendationSettingsPayload } from "../types/algorithm";

export function AlgorithmSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AlgorithmDailyRecommendationSettings | null>(null);
  const [overview, setOverview] = useState<AlgorithmCatalogOverviewType | null>(null);
  const [problems, setProblems] = useState<AlgorithmProblem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [nextSettings, nextOverview, nextProblems] = await Promise.all([getAlgorithmDailySettings(), getAlgorithmCatalogOverview(), listAlgorithmProblems({ limit: 60 })]);
      setSettings(nextSettings);
      setOverview(nextOverview);
      setProblems(nextProblems);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练设置加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const topics = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort(), [problems]);
  const sourceLists = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.source_lists))).sort(), [problems]);

  async function saveSettings(payload: UpdateAlgorithmDailyRecommendationSettingsPayload) {
    setIsSaving(true);
    setError("");
    try {
      setSettings(await updateAlgorithmDailySettings(payload));
      setNotice("设置已保存，将从明天生效。需要立即换题时，请刷新今天的推荐。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存训练设置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshToday() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError("");
    try {
      await refreshAlgorithmDailyFeed();
      setRefreshDialogOpen(false);
      setNotice("今天的推荐已刷新。之前的训练和记录仍会保留。");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "刷新今天的推荐失败。");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function createTemporaryTraining(payload: CreateAlgorithmSessionPayload) {
    if (isCreating) return;
    setIsCreating(true);
    setError("");
    try {
      const session = await createAlgorithmSession(payload);
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
      navigate(`/algorithms/session/${session.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建临时训练失败。");
    } finally {
      setIsCreating(false);
    }
  }

  return <div className="algorithm-workspace-panel algorithm-settings-page">{error ? <p className="field-error page-error" role="alert">{error}</p> : null}{notice ? <p className="algorithm-settings-notice" role="status">{notice}</p> : null}{isLoading ? <div className="settings-skeleton"><div className="skeleton-block" /><div className="skeleton-block" /></div> : null}{settings && overview ? <div className="algorithm-settings-layout"><div className="algorithm-settings-main"><DailyRecommendationSettingsForm isSaving={isSaving} onSave={(payload) => void saveSettings(payload)} settings={settings} sourceLists={sourceLists} topics={topics} /><section className="daily-refresh-panel"><div><span className="pane-label">今日推荐</span><h2>手动更新</h2><p>保存设置不会替换今天已经看到的题目。</p></div><button className="button button-secondary" disabled={isRefreshing} onClick={() => setRefreshDialogOpen(true)} type="button"><ArrowsClockwiseIcon aria-hidden="true" size={16} weight="bold" />刷新今天的推荐</button></section><TemporaryTrainingBuilder isCreating={isCreating} onCreate={(payload) => void createTemporaryTraining(payload)} problems={problems} /></div><aside className="algorithm-settings-sidebar"><AlgorithmCatalogOverview overview={overview} /><AlgorithmCatalogBrowser problems={problems} /></aside></div> : null}<RefreshDailyRecommendationDialog hasExistingLearning isRefreshing={isRefreshing} onCancel={() => setRefreshDialogOpen(false)} onConfirm={() => void refreshToday()} open={refreshDialogOpen} /></div>;
}
