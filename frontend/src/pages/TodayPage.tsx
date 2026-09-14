import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { useTodayWorkspace } from "../hooks/useTodayWorkspace";
import { useUserPreferences } from "../hooks/useUserPreferences";
import {
  getDailySentence,
  getTodayProgressItems,
  progressRatio,
  type TodayProgressItem,
} from "../services/userPreferences";

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

export function TodayPage() {
  const { data, failedSectionCount, isLoading, refresh } = useTodayWorkspace();
  const [preferences] = useUserPreferences();
  const progressItems = getTodayProgressItems(data, preferences);
  const progressPercent = Math.round(progressRatio(progressItems) * 100);
  const completedTotal = progressItems.reduce((sum, item) => sum + item.completed, 0);
  const targetTotal = progressItems.reduce((sum, item) => sum + item.target, 0);
  const algorithmSession = [...data.algorithmSessions].sort((a, b) => Date.parse(b.last_active_at) - Date.parse(a.last_active_at))[0];
  const interviewSession = [...data.interviewSessions].sort((a, b) => Date.parse(b.last_active_at) - Date.parse(a.last_active_at))[0];
  const continueAction = getContinueAction(progressItems, algorithmSession, interviewSession);

  return (
    <div className="today-page">
      <header className="today-hero">
        <div className="today-hero-copy">
          <span className="page-kicker">{todayLabel()}</span>
          <h1>{getDailySentence()}</h1>
        </div>
      </header>

      {failedSectionCount > 0 && !isLoading ? (
        <div className="today-sync-notice" role="status">
          <span>有 {failedSectionCount} 组数据暂时未同步，其余内容仍可使用。</span>
          <button className="button button-secondary" onClick={refresh} type="button">重新同步</button>
        </div>
      ) : null}

      <main className="today-workspace">
        <section className="today-priority" aria-labelledby="today-priority-title">
          <div className="today-section-heading">
            <div>
              <span className="pane-label">今日进度</span>
              <h2 id="today-priority-title">继续今天的学习</h2>
            </div>
            <strong className="today-progress-total">{isLoading ? "同步中" : `${completedTotal} / ${targetTotal}`}</strong>
          </div>

          <div className="today-progress-panel">
            <TodayProgressBar isLoading={isLoading} progressPercent={progressPercent} />
            <div className="today-progress-details">
              {progressItems.map((item) => <ProgressLine item={item} isLoading={isLoading} key={item.key} />)}
            </div>
          </div>

          <Link className="button button-primary today-continue-button" to={continueAction.href}>
            {continueAction.label}<ArrowRightIcon aria-hidden="true" size={17} weight="bold" />
          </Link>

        </section>
      </main>
    </div>
  );
}

function TodayProgressBar({ isLoading, progressPercent }: { isLoading: boolean; progressPercent: number }) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const target = Math.min(100, Math.max(0, progressPercent)) / 100;

  useLayoutEffect(() => {
    const fill = fillRef.current;
    if (!fill || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animationRef.current?.cancel();
      animationRef.current = null;
      return;
    }

    const currentTransform = getComputedStyle(fill).transform;
    animationRef.current?.cancel();

    if (isLoading) {
      animationRef.current = fill.animate([
        { opacity: 0.72, transform: "scaleX(0.08)" },
        { opacity: 1, transform: "scaleX(0.46)" },
        { opacity: 0.8, transform: "scaleX(0.14)" },
      ], { duration: 1_300, easing: "ease-in-out", iterations: Infinity });
      return;
    }

    const current = currentTransform === "none" ? 0 : Number(currentTransform.split("(")[1]?.split(",")[0]) || 0;
    const distance = target - current;
    animationRef.current = fill.animate([
      { opacity: 1, transform: `scaleX(${current})` },
      { opacity: 1, transform: `scaleX(${current + distance * 0.72})`, offset: 0.56 },
      { opacity: 1, transform: `scaleX(${current + distance * 0.62})`, offset: 0.7 },
      { opacity: 1, transform: `scaleX(${target})` },
    ], { duration: 820, easing: "ease-out", fill: "forwards" });
  }, [isLoading, target]);

  useLayoutEffect(() => () => animationRef.current?.cancel(), []);

  return (
    <div
      aria-busy={isLoading}
      aria-label={isLoading ? "正在同步今日学习进度" : "今日学习进度"}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={isLoading ? undefined : progressPercent}
      className="today-progress-track"
      role="progressbar"
    >
      <span ref={fillRef} style={{ transform: `scaleX(${isLoading ? 0.14 : target})` }} />
    </div>
  );
}

function getContinueAction(
  items: TodayProgressItem[],
  algorithmSession: { id: string; current_index: number } | undefined,
  interviewSession: { id: number } | undefined,
) {
  if (algorithmSession) return { href: `/algorithms/session/${algorithmSession.id}`, label: `继续：算法第 ${algorithmSession.current_index + 1} 题` };
  if (interviewSession) return { href: `/interview/session/${interviewSession.id}`, label: "继续：八股训练" };
  const next = items.find((item) => item.completed < item.target);
  return next ? { href: next.href, label: `开始：${next.label}` } : { href: "/diary", label: "今天已完成，写点补充日记" };
}

function ProgressLine({ item, isLoading }: { item: TodayProgressItem; isLoading: boolean }) {
  const completed = Math.min(item.completed, item.target);
  const text = item.key === "diary"
    ? `日记 ${item.completed ? "已记录" : "未记录"}`
    : `${item.key === "review" ? "复习" : `今日${item.label}`} ${completed} / ${item.target}`;
  return (
    <Link className="today-progress-line" to={item.href}>
      <span>{isLoading ? `${item.label} 待同步` : text}</span>
      <ArrowRightIcon aria-hidden="true" size={15} />
    </Link>
  );
}
