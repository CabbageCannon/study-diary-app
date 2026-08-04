import { useTodayStudySummary } from "../hooks/useTodayStudySummary";
import { formatStudyDuration } from "../utils/studyDuration";

export function TodayStudySummary() {
  const { summary, isLoading, error } = useTodayStudySummary();

  if (!summary) {
    return (
      <div aria-live="polite" className={`today-study-summary${isLoading ? " today-study-summary-loading" : ""}`}>
        {isLoading ? <><span className="today-study-summary-line" /><span className="today-study-summary-line today-study-summary-line-short" /></> : error ? "学习统计暂时不可用" : "今天还没有学习记录"}
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
    </div>
  );
}
