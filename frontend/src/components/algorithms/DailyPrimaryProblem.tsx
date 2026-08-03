import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";

import type { AlgorithmDailyFeed } from "../../types/algorithm";

interface DailyPrimaryProblemProps {
  feed: AlgorithmDailyFeed;
  isCreating: boolean;
  onStart: () => void;
}

function difficultyLabel(difficulty: string) {
  return { easy: "简单", medium: "中等", hard: "困难" }[difficulty] ?? difficulty;
}

export function DailyPrimaryProblem({ feed, isCreating, onStart }: DailyPrimaryProblemProps) {
  const problem = feed.primary_problem;
  const actionLabel = feed.primary_problem_completed ? "再次练习" : "开始今日训练";

  return <article className="daily-primary-problem"><div className="daily-primary-heading"><span>今日主推荐</span><SparkleIcon aria-hidden="true" size={18} weight="fill" /></div><div className="problem-meta-row"><span className={`difficulty-badge difficulty-${problem.difficulty}`}>{difficultyLabel(problem.difficulty)}</span>{problem.topics.map((topic) => <span className="topic-token" key={topic}>{topic}</span>)}</div><h2>{problem.title_zh || problem.title}</h2><p className="daily-problem-original-title">{problem.title || problem.slug}</p><p className="daily-problem-source">{problem.source_lists.join(" / ") || "本地题库"}</p><p className="daily-strategy-summary">{feed.settings_summary}</p><div className="daily-problem-state"><span>{feed.primary_problem_completed ? "已完成过" : "尚未完成"}</span>{feed.primary_problem_needs_review ? <span>待复习</span> : null}{feed.primary_problem_attempt_count ? <span className="tabular-number">{feed.primary_problem_attempt_count} 次尝试</span> : null}</div><div className="daily-primary-actions"><button className="button button-primary" disabled={isCreating} onClick={onStart} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />{isCreating ? "创建中" : actionLabel}</button><a className="button button-secondary" href={problem.url} rel="noreferrer" target="_blank">打开原题<ArrowSquareOutIcon aria-hidden="true" size={16} /></a></div></article>;
}
