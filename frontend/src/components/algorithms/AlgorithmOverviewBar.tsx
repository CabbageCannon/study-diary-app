import { Link } from "react-router-dom";

import type { AlgorithmStats } from "../../types/algorithm";

interface AlgorithmOverviewBarProps {
  stats: AlgorithmStats | null;
}

function minutes(seconds: number | null | undefined) {
  return seconds ? `${Math.max(1, Math.round(seconds / 60))} 分` : "-";
}

export function AlgorithmOverviewBar({ stats }: AlgorithmOverviewBarProps) {
  const items = [
    { label: "连续", value: stats?.current_streak_days ?? 0, unit: "天" },
    { label: "今日完成", value: stats?.today_completed_count ?? 0, unit: "题" },
    { label: "累计尝试", value: stats?.total_attempt_count ?? 0, unit: "次" },
    { label: "完成题目", value: stats?.unique_solved_count ?? 0, unit: "题" },
    { label: "平均用时", value: minutes(stats?.average_duration_seconds), unit: "" },
  ];

  return (
    <section className="algorithm-overview-bar" aria-label="算法学习概览">
      {items.map((item) => <div className="algorithm-overview-item" key={item.label}><span>{item.label}</span><strong className="tabular-number">{item.value}</strong><small>{item.unit}</small></div>)}
      <Link className={(stats?.due_review_count ?? 0) ? "algorithm-overview-item algorithm-review-entry" : "algorithm-overview-item algorithm-review-entry algorithm-review-entry-empty"} to="/algorithms/review"><span>待复习</span><strong className="tabular-number">{stats?.due_review_count ?? 0}</strong><small>题</small><b aria-hidden="true">→</b></Link>
    </section>
  );
}
