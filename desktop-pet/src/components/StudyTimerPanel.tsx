import { useState } from "react";

import { formatDuration } from "../state/selectors";
import type { StudyActivityType, StudyTimerState } from "../types";

const activityOptions: { value: StudyActivityType; label: string }[] = [
  { value: "algorithm", label: "算法训练" },
  { value: "interview", label: "八股训练" },
  { value: "diary", label: "学习日记" },
  { value: "reading", label: "阅读" },
  { value: "course", label: "课程" },
  { value: "custom", label: "自定义" },
];

interface StudyTimerPanelProps {
  timer: StudyTimerState | null;
  elapsed: number;
  onStart: (activity: StudyActivityType, title: string) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onComplete: () => Promise<void>;
}

export function StudyTimerPanel({ timer, elapsed, onStart, onPause, onResume, onComplete }: StudyTimerPanelProps) {
  const [activity, setActivity] = useState<StudyActivityType>("reading");
  const [title, setTitle] = useState("自主学习");
  const [working, setWorking] = useState(false);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  }

  if (!timer) {
    return <div className="timer-start-form"><label><span>学习类型</span><select onChange={(event) => setActivity(event.currentTarget.value as StudyActivityType)} value={activity}>{activityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>本次主题</span><input maxLength={160} onChange={(event) => setTitle(event.currentTarget.value)} value={title} /></label><button className="pet-primary-action" disabled={working} onClick={() => void run(() => onStart(activity, title))} type="button">开始学习</button></div>;
  }

  return <div className="timer-running"><div><span>本次学习</span><strong>{formatDuration(elapsed)}</strong><small>{timer.title}</small></div><div className="timer-actions">{timer.status === "running" ? <button onClick={() => void run(onPause)} disabled={working} type="button">暂停</button> : <button onClick={() => void run(onResume)} disabled={working} type="button">继续</button>}<button className="pet-danger-action" onClick={() => void run(onComplete)} disabled={working} type="button">完成</button></div></div>;
}
