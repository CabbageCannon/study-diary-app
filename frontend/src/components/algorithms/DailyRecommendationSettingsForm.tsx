import { useEffect, useMemo, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";

import type { AlgorithmDailyRecommendationSettings, AlgorithmDailyRecommendationStrategy, AlgorithmDifficulty, UpdateAlgorithmDailyRecommendationSettingsPayload } from "../../types/algorithm";

interface DailyRecommendationSettingsFormProps {
  settings: AlgorithmDailyRecommendationSettings;
  topics: string[];
  sourceLists: string[];
  isSaving: boolean;
  onSave: (payload: UpdateAlgorithmDailyRecommendationSettingsPayload) => void;
}

const strategyOptions: { value: AlgorithmDailyRecommendationStrategy; label: string }[] = [
  { value: "balanced", label: "均衡" }, { value: "random", label: "随机" }, { value: "topic", label: "题型" }, { value: "difficulty", label: "难度" }, { value: "source_list", label: "题单" }, { value: "weakness", label: "薄弱点" }, { value: "wrong", label: "错题" }, { value: "review_first", label: "复习优先" },
];

function toggle<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function summary(draft: UpdateAlgorithmDailyRecommendationSettingsPayload) {
  const parts = [strategyOptions.find((item) => item.value === draft.strategy)?.label ?? "均衡"];
  if (draft.topics.length) parts.push(draft.topics.slice(0, 2).join("、"));
  if (draft.difficulties.length) parts.push(draft.difficulties.map((item) => ({ easy: "简单", medium: "中等", hard: "困难" })[item]).join("、"));
  if (draft.source_lists.length) parts.push(draft.source_lists.slice(0, 2).join("、"));
  return `每天按${parts.join(" · ")}推荐，${draft.prioritize_due_review ? "优先到期复习" : "优先未完成"}${draft.exclude_solved ? "，排除已完成" : ""}，避开 ${draft.avoid_recent_days} 天内重复；首页额外展示 ${draft.extra_recommendation_count} 道同策略题目。`;
}

export function DailyRecommendationSettingsForm({ settings, topics, sourceLists, isSaving, onSave }: DailyRecommendationSettingsFormProps) {
  const [draft, setDraft] = useState<UpdateAlgorithmDailyRecommendationSettingsPayload>(() => ({ ...settings }));
  useEffect(() => { setDraft({ ...settings }); }, [settings]);
  const description = useMemo(() => summary(draft), [draft]);

  return <section className="daily-settings-panel" aria-labelledby="daily-settings-title"><div className="section-heading"><div><span className="pane-label">每日推荐方式</span><h2 id="daily-settings-title">设置每天怎么练</h2></div></div><div className="daily-settings-form"><label className="form-field"><span>推荐策略</span><select value={draft.strategy} onChange={(event) => setDraft((value) => ({ ...value, strategy: event.target.value as AlgorithmDailyRecommendationStrategy }))}>{strategyOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><fieldset className="settings-choice-group"><legend>题型</legend><div className="settings-choice-grid">{topics.map((topic) => <button aria-pressed={draft.topics.includes(topic)} className={draft.topics.includes(topic) ? "settings-choice settings-choice-active" : "settings-choice"} key={topic} onClick={() => setDraft((value) => ({ ...value, topics: toggle(value.topics, topic) }))} type="button">{topic}</button>)}</div></fieldset><fieldset className="settings-choice-group"><legend>难度</legend><div className="settings-choice-grid settings-choice-grid-compact">{(["easy", "medium", "hard"] as AlgorithmDifficulty[]).map((difficulty) => <button aria-pressed={draft.difficulties.includes(difficulty)} className={draft.difficulties.includes(difficulty) ? "settings-choice settings-choice-active" : "settings-choice"} key={difficulty} onClick={() => setDraft((value) => ({ ...value, difficulties: toggle(value.difficulties, difficulty) }))} type="button">{{ easy: "简单", medium: "中等", hard: "困难" }[difficulty]}</button>)}</div></fieldset><fieldset className="settings-choice-group"><legend>题单</legend><div className="settings-choice-grid settings-choice-grid-compact">{sourceLists.map((source) => <button aria-pressed={draft.source_lists.includes(source)} className={draft.source_lists.includes(source) ? "settings-choice settings-choice-active" : "settings-choice"} key={source} onClick={() => setDraft((value) => ({ ...value, source_lists: toggle(value.source_lists, source) }))} type="button">{source}</button>)}</div></fieldset><div className="settings-toggle-list"><label><input checked={draft.prioritize_due_review} onChange={(event) => setDraft((value) => ({ ...value, prioritize_due_review: event.target.checked }))} type="checkbox" /><span>优先安排到期复习</span></label><label><input checked={draft.exclude_solved} onChange={(event) => setDraft((value) => ({ ...value, exclude_solved: event.target.checked }))} type="checkbox" /><span>默认排除已完成题</span></label><label><input checked={draft.include_review_items} onChange={(event) => setDraft((value) => ({ ...value, include_review_items: event.target.checked }))} type="checkbox" /><span>继续刷包含需复习题目</span></label><label><input checked={draft.include_adjacent_difficulty} onChange={(event) => setDraft((value) => ({ ...value, include_adjacent_difficulty: event.target.checked }))} type="checkbox" /><span>题池不足时允许相邻难度</span></label></div><div className="daily-settings-inline-fields"><label className="form-field"><span>避免近期重复</span><select value={draft.avoid_recent_days} onChange={(event) => setDraft((value) => ({ ...value, avoid_recent_days: Number(event.target.value) }))}>{[0, 7, 14, 30].map((days) => <option key={days} value={days}>{days ? `${days} 天` : "不限制"}</option>)}</select></label><fieldset className="settings-choice-group"><legend>继续刷数量</legend><div className="settings-choice-grid settings-choice-grid-compact">{([4, 6, 8] as const).map((count) => <button aria-pressed={draft.extra_recommendation_count === count} className={draft.extra_recommendation_count === count ? "settings-choice settings-choice-active" : "settings-choice"} key={count} onClick={() => setDraft((value) => ({ ...value, extra_recommendation_count: count }))} type="button">{count} 题</button>)}</div></fieldset></div></div><div className="daily-settings-summary"><span>当前配置</span><p>{description}</p></div><button className="button button-primary" disabled={isSaving} onClick={() => onSave(draft)} type="button"><FloppyDiskIcon aria-hidden="true" size={16} weight="bold" />{isSaving ? "保存中" : "保存设置"}</button></section>;
}
