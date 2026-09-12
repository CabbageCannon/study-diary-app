import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/ArrowsClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { Link } from "react-router-dom";

import type { AlgorithmProblem } from "../../types/algorithm";

interface DailyExtraProblemListProps {
  problems: AlgorithmProblem[];
  creatingProblemId: number | null;
  isRefreshing: boolean;
  onStart: (problem: AlgorithmProblem) => void;
  onRefresh: () => void;
}

function difficultyLabel(difficulty: string) {
  return { easy: "简单", medium: "中等", hard: "困难" }[difficulty] ?? difficulty;
}

export function DailyExtraProblemList({ problems, creatingProblemId, isRefreshing, onStart, onRefresh }: DailyExtraProblemListProps) {
  return <details className="daily-continuation-section daily-extra-problem-list"><summary><span><strong>同策略推荐</strong><small>{problems.length ? `${problems.length} 道候选题` : "暂无候选题"}</small></span><CaretDownIcon aria-hidden="true" size={18} weight="bold" /></summary><div className="daily-extra-rows">{problems.map((problem) => <button className="daily-extra-row" disabled={creatingProblemId === problem.id} key={problem.id} onClick={() => onStart(problem)} type="button"><span><strong>{problem.title_zh || problem.title}</strong><small>{difficultyLabel(problem.difficulty)} · {problem.topics[0] ?? problem.pattern_key}</small></span><ArrowRightIcon aria-hidden="true" size={17} /></button>)}{!problems.length ? <p className="algorithm-muted-copy">当前条件下没有额外推荐题目。</p> : null}</div><div className="daily-extra-actions"><button className="text-icon-button" disabled={isRefreshing} onClick={onRefresh} type="button"><ArrowsClockwiseIcon aria-hidden="true" size={16} weight="bold" />{isRefreshing ? "刷新中" : "换一批"}</button><Link className="text-icon-button" to="/algorithms/settings">训练设置<ArrowRightIcon aria-hidden="true" size={16} /></Link></div></details>;
}
