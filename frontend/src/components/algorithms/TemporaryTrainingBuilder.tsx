import { useMemo, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { PlayIcon } from "@phosphor-icons/react/Play";

import type { AlgorithmDifficulty, AlgorithmProblem, AlgorithmTrainingMode, CreateAlgorithmSessionPayload } from "../../types/algorithm";

interface TemporaryTrainingBuilderProps {
  problems: AlgorithmProblem[];
  isCreating: boolean;
  onCreate: (payload: CreateAlgorithmSessionPayload) => void;
  title?: string;
  eyebrow?: string;
  onOpen?: () => void;
}

const modes: { mode: AlgorithmTrainingMode; label: string }[] = [
  { mode: "hot100", label: "Hot 100" }, { mode: "topic", label: "按题型" }, { mode: "difficulty", label: "按难度" }, { mode: "random", label: "随机" }, { mode: "weakness", label: "薄弱点" }, { mode: "wrong", label: "错题" }, { mode: "similar", label: "相似题" }, { mode: "custom", label: "自选题" },
];

export function TemporaryTrainingBuilder({ problems, isCreating, onCreate, title = "指定偏好", eyebrow = "按偏好创建", onOpen }: TemporaryTrainingBuilderProps) {
  const [mode, setMode] = useState<AlgorithmTrainingMode>("hot100");
  const [count, setCount] = useState(3);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<AlgorithmDifficulty>("medium");
  const [referenceProblemId, setReferenceProblemId] = useState("");
  const [customProblemIds, setCustomProblemIds] = useState<string[]>([]);
  const topics = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort(), [problems]);

  function toggleProblem(id: string) {
    setCustomProblemIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function submit() {
    onCreate({ mode, count, topics: mode === "topic" && topic ? [topic] : undefined, difficulty: mode === "difficulty" ? [difficulty] : undefined, reference_problem_id: mode === "similar" ? referenceProblemId || undefined : undefined, problem_ids: mode === "custom" ? customProblemIds : undefined, prioritize_due_review: mode !== "random" });
  }

  return <details className="daily-continuation-section temporary-training-builder" onToggle={(event) => { if (event.currentTarget.open) onOpen?.(); }}><summary><span><strong>{title}</strong><small>{eyebrow}</small></span><CaretDownIcon aria-hidden="true" size={18} weight="bold" /></summary><div className="temporary-training-body"><div className="temporary-mode-list">{modes.map((item) => <button aria-pressed={mode === item.mode} className={mode === item.mode ? "temporary-mode temporary-mode-active" : "temporary-mode"} key={item.mode} onClick={() => setMode(item.mode)} type="button">{item.label}</button>)}</div><div className="temporary-training-fields">{mode === "topic" ? <label><span>题型</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">全部题型</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}{mode === "difficulty" ? <label><span>难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as AlgorithmDifficulty)}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label> : null}{mode === "similar" ? <label><span>参考题</span><select value={referenceProblemId} onChange={(event) => setReferenceProblemId(event.target.value)}><option value="">选择本地题目</option>{problems.map((problem) => <option key={problem.id} value={problem.id}>{problem.title_zh || problem.title}</option>)}</select></label> : null}{mode === "custom" ? <fieldset className="temporary-problem-picker"><legend>选择题目</legend><div>{problems.slice(0, 18).map((problem) => <button aria-pressed={customProblemIds.includes(String(problem.id))} className={customProblemIds.includes(String(problem.id)) ? "settings-choice settings-choice-active" : "settings-choice"} key={problem.id} onClick={() => toggleProblem(String(problem.id))} type="button">{problem.title_zh || problem.title}</button>)}</div></fieldset> : null}{mode !== "custom" ? <label><span>题数</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[3, 5, 8, 10].map((item) => <option key={item} value={item}>{item} 题</option>)}</select></label> : null}</div><button className="button button-secondary" disabled={isCreating || mode === "similar" && !referenceProblemId || mode === "custom" && !customProblemIds.length} onClick={submit} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />{isCreating ? "创建中" : "创建训练"}</button></div></details>;
}
