import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { NotePencilIcon } from "@phosphor-icons/react/NotePencil";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { Link } from "react-router-dom";

import { useUserPreferences } from "../hooks/useUserPreferences";
import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import type { AlgorithmSessionSummary } from "../types/algorithm";
import type { InterviewQuestionSetSummary } from "../types/interview";
import { getDailySentence, getTodayProgressItems, progressRatio, type TodayProgressItem } from "../services/userPreferences";
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
  const [preferences] = useUserPreferences();
  const algorithmSession = newestAlgorithmSession(data.algorithmSessions);
  const interviewSession = newestInterviewSession(data.interviewSessions);
  const focusSeconds = data.desktopPet?.today_study_seconds ?? 0;
  const dueCount = (data.algorithmStats?.due_review_count ?? 0) + (data.interviewStats?.due_review_count ?? 0);
  const progressItems = getTodayProgressItems(data, preferences);
  const progressPercent = Math.round(progressRatio(progressItems) * 100);
  const hasProgress = progressItems.some((item) => item.completed > 0) || focusSeconds > 0;

  return (
    <div className="today-page">
      <header className="today-hero">
        <div className="today-hero-copy">
          <span className="page-kicker">{todayLabel()}</span>
          <h1>{hasProgress ? "今天已经在向前走。" : "今天，慢一点也没关系。"}</h1>
          <p>{getDailySentence()}</p>
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
              <h2 id="today-priority-title">继续今天的学习</h2>
            </div>
            <span>{isLoading ? "正在同步" : `${progressPercent}%`}</span>
          </div>

          <div className="today-progress-panel">
            <div className="today-progress-track" aria-label={`今日总进度 ${progressPercent}%`}>
              <span style={{ inlineSize: `${progressPercent}%` }} />
            </div>
            <div className="today-progress-details">
              {progressItems.map((item) => (
                <ProgressLine item={item} isLoading={isLoading} key={item.key} />
              ))}
            </div>
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
            <Link to="/interview"><BookOpenIcon aria-hidden="true" size={18} weight="regular" /><span><strong>练 {preferences.dailyGoals.interview} 道八股</strong><small>先回忆，再核对</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
            <Link to="/algorithms"><TreeStructureIcon aria-hidden="true" size={18} weight="regular" /><span><strong>练 {preferences.dailyGoals.algorithm} 道算法</strong><small>题意、思路和反馈</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
            <Link to="/write"><NotePencilIcon aria-hidden="true" size={18} weight="regular" /><span><strong>写学习日记</strong><small>把今天沉淀下来</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
            <Link to="/algorithms/review"><ClockIcon aria-hidden="true" size={18} weight="regular" /><span><strong>有 {isLoading ? "待同步" : dueCount} 项待复习</strong><small>按到期顺序处理</small></span><ArrowRightIcon aria-hidden="true" size={16} weight="bold" /></Link>
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

function ProgressLine({ item, isLoading }: { item: TodayProgressItem; isLoading: boolean }) {
  const safeCompleted = Math.min(item.completed, item.target);
  return (
    <Link className="today-progress-line" to={item.href}>
      <span>今日 {safeCompleted}/{item.target} {item.label}已完成</span>
      <strong>{isLoading ? "待同步" : item.completed >= item.target ? "完成" : `还差 ${item.target - safeCompleted}`}</strong>
    </Link>
  );
}
