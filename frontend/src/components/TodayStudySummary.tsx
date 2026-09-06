import { Link } from "react-router-dom";

import { useTodayStudySummary } from "../hooks/useTodayStudySummary";
import { formatStudyDuration } from "../utils/studyDuration";

function errorMessage(error: ReturnType<typeof useTodayStudySummary>["error"]) {
  switch (error) {
    case "unauthorized":
      return <><span>请先在桌宠设置中填写访问码</span><Link to="/settings/desktop-pet">去设置</Link></>;
    case "forbidden":
      return "当前访问码没有查看学习统计的权限";
    case "validation":
      return "学习统计请求参数无效";
    case "network":
      return "无法连接学习服务";
    case "server":
    case "unknown":
      return "学习统计暂时不可用";
    default:
      return null;
  }
}

export function TodayStudySummary() {
  const { summary, isLoading, error } = useTodayStudySummary();

  if (!summary) {
    return (
      <div aria-live="polite" className={`today-study-summary${isLoading ? " today-study-summary-loading" : ""}`}>
        {isLoading ? <><span className="today-study-summary-line" /><span className="today-study-summary-line today-study-summary-line-short" /></> : error ? errorMessage(error) : "今天还没有学习记录"}
      </div>
    );
  }

  const hasTodayData = summary.today_session_count > 0 || summary.today_study_seconds > 0;
  if (!hasTodayData) {
    return <div aria-live="polite" className="today-study-summary">今天还没有学习记录</div>;
  }

  const visibleTopics = summary.today_topics.slice(0, 3).map((topic) => topic.title);
  const additionalTopicCount = Math.max(0, summary.today_topic_count - visibleTopics.length);
  return (
    <div aria-live="polite" className="today-study-summary">
      <strong>今日 {formatStudyDuration(summary.today_study_seconds)}</strong>
      <span>累计 {formatStudyDuration(summary.total_study_seconds)}{visibleTopics.length ? ` · ${visibleTopics.join(" / ")}` : ""}{additionalTopicCount > 0 ? ` +${additionalTopicCount}` : ""}</span>
      {error ? <small className="today-study-summary-stale">更新失败，正在保留上次数据</small> : null}
    </div>
  );
}
