import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { Link } from "react-router-dom";

import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import type { AlgorithmSessionSummary } from "../types/algorithm";
import type { InterviewQuestionSetSummary } from "../types/interview";
import { formatStudyDuration } from "../utils/studyDuration";

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function newestAlgorithmSession(sessions: AlgorithmSessionSummary[]) {
  return [...sessions].sort((left, right) => Date.parse(right.last_active_at) - Date.parse(left.last_active_at))[0] ?? null;
}

function newestInterviewSession(sessions: InterviewQuestionSetSummary[]) {
  return [...sessions].sort((left, right) => Date.parse(right.last_active_at) - Date.parse(left.last_active_at))[0] ?? null;
}

export function TodayPage() {
  const { data, failedSectionCount, isLoading, refresh } = useTodayWorkspace();
  const algorithmSession = newestAlgorithmSession(data.algorithmSessions);
  const interviewSession = newestInterviewSession(data.interviewSessions);
  const focusSeconds = data.desktopPet?.today_study_seconds ?? 0;
  const dueCount = (data.algorithmStats?.due_review_count ?? 0) + (data.interviewStats?.due_review_count ?? 0);
  const hasProgress = focusSeconds > 0 || (data.algorithmStats?.today_completed_count ?? 0) > 0 || (data.interviewStats?.today_answered_count ?? 0) > 0;

  return (
    <div className="today-page">
      <header className="today-hero">
        <div className="today-hero-copy">
          <span className="page-kicker">{todayLabel()}</span>
          <h1>{hasProgress ? "今天已经在向前走。" : "今天，慢一点也没关系。"}</h1>
          <p>先续上未完成的训练，或者只讲一道题。</p>
        </div>
      </header>

      {failedSectionCount > 0 && !isLoading ? (
        <div className="today-sync-notice" role="status">
          <span>有 {failedSectionCount} 组数据暂时未同步，其余内容仍可使用。</span>
          <button className="button button-secondary" onClick={refresh} type="button">重新同步</button>
        </div>
      ) : null}

      <div className="today-workspace">
        <section className="today-priority" aria-labelledby="today-priority-title">
          <div className="today-section-heading">
            <div>
              <span className="pane-label">接下来</span>
              <h2 id="today-priority-title">先从这里继续</h2>
            </div>
            <span>{algorithmSession || interviewSession ? "未完成内容已置顶" : "没有遗留任务"}</span>
          </div>

          {isLoading ? (
            <div className="today-priority-skeleton" aria-label="正在加载今日任务">
              <span /><span /><span />
            </div>
          ) : algorithmSession || interviewSession ? (
            <div className="today-resume-list">
              {algorithmSession ? (
                <Link className="today-resume-row" to={`/algorithms/session/${algorithmSession.id}`}>
                  <span className="today-resume-icon"><TreeStructureIcon aria-hidden="true" size={19} weight="bold" /></span>
                  <span>
                    <small>算法训练 · 未完成</small>
                    <strong>继续第 {Math.min(algorithmSession.current_index + 1, algorithmSession.question_count)} / {algorithmSession.question_count} 题</strong>
                  </span>
                  <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
                </Link>
              ) : null}
              {interviewSession ? (
                <Link className="today-resume-row" to={`/interview/session/${interviewSession.id}`}>
                  <span className="today-resume-icon"><PlayIcon aria-hidden="true" size={18} weight="fill" /></span>
                  <span>
                    <small>八股训练 · {interviewSession.domain ?? "综合"}</small>
                    <strong>继续剩余 {Math.max(0, interviewSession.question_count - interviewSession.answered_count - interviewSession.skipped_count)} 题</strong>
                  </span>
                  <ArrowRightIcon aria-hidden="true" size={18} weight="bold" />
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="today-empty-state">
              <strong>没有需要续上的训练</strong>
              <p>可以直接开始今日算法题，或先写下此刻最想解决的问题。</p>
              <Link className="button button-primary" to="/algorithms">讲一道算法</Link>
            </div>
          )}

          <div className="today-start-list">
            <Link to="/interview"><BookOpenIcon aria-hidden="true" size={18} weight="regular" /><span><strong>练 3 道八股</strong><small>先回忆，再核对</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
            <Link to="/algorithms"><TreeStructureIcon aria-hidden="true" size={18} weight="regular" /><span><strong>讲一道算法</strong><small>题意、思路和反馈</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
            <Link to="/algorithms/review"><ClockIcon aria-hidden="true" size={18} weight="regular" /><span><strong>有 {isLoading ? "待同步" : dueCount} 项待复习</strong><small>按到期顺序处理</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
          </div>

          <div className="today-recommendation">
            <div className="today-recommendation-index" aria-hidden="true">今</div>
            <div>
              <span className="pane-label">今日算法</span>
              <h3>{data.algorithmFeed?.primary_problem.title_zh ?? data.algorithmFeed?.primary_problem.title ?? "每日推荐正在准备"}</h3>
              <p>
                {data.algorithmFeed
                  ? `${data.algorithmFeed.primary_problem.difficulty.toUpperCase()} / ${data.algorithmFeed.primary_problem.topics.slice(0, 3).join(" / ") || "综合训练"}`
                  : "进入算法训练页查看题库与当前推荐。"}
              </p>
            </div>
            <Link className="button button-secondary" to="/algorithms">查看题目 <ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
          </div>
        </section>

        <aside className="today-sidebar" aria-label="今日快捷入口">
          <section className="today-quick-actions">
            <span className="pane-label">记录</span>
            <h2>今天想留下什么？</h2>
            <Link className="button button-secondary" to="/write"><BookOpenIcon aria-hidden="true" size={18} weight="regular" />写学习日记</Link>
          </section>

          <section className="today-review-queue">
            <div>
              <ClockIcon aria-hidden="true" size={19} weight="bold" />
              <span className="pane-label">复习队列</span>
            </div>
            <strong className="tabular-number">{isLoading ? "待同步" : dueCount}</strong>
            <p>算法 {data.algorithmStats?.due_review_count ?? 0} 项，八股 {data.interviewStats?.due_review_count ?? 0} 项。</p>
            <div className="today-review-links">
              <Link to="/algorithms/review">算法复习</Link>
              <Link to="/interview">八股复习</Link>
            </div>
          </section>

          <section className="today-review-queue today-metrics-panel" aria-label="今日学习概况">
            <span className="pane-label">今日统计</span>
            <dl className="today-metrics">
              <div>
                <dt>专注</dt>
                <dd>{isLoading ? <span className="today-inline-skeleton" /> : formatStudyDuration(focusSeconds)}</dd>
              </div>
              <div>
                <dt>算法</dt>
                <dd className="tabular-number">{isLoading ? "待同步" : `${data.algorithmStats?.today_completed_count ?? 0} 题`}</dd>
              </div>
              <div>
                <dt>八股</dt>
                <dd className="tabular-number">{isLoading ? "待同步" : `${data.interviewStats?.today_answered_count ?? 0} 题`}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
