import { useState } from "react";

import { formatDuration } from "../state/selectors";
import type { StudyActivityType, StudyTimerState } from "../types";

interface StudyTimerPanelProps {
  timer: StudyTimerState | null;
  elapsed: number;
  onStart: (activity: StudyActivityType, title: string) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onComplete: () => Promise<void>;
}

export function StudyTimerPanel({ timer, elapsed, onStart, onPause, onResume, onComplete }: StudyTimerPanelProps) {
  const [working, setWorking] = useState(false);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  }

  if (!timer) {
    return <div className="timer-idle"><span>未开始计时</span><button className="pet-primary-action" disabled={working} onClick={() => void run(() => onStart("reading", "自主学习"))} type="button">开始</button></div>;
  }

  return <div className="timer-running"><div><span>本次学习</span><strong>{formatDuration(elapsed)}</strong><small>{timer.title}</small></div><div className="timer-actions">{timer.status === "running" ? <button onClick={() => void run(onPause)} disabled={working} type="button">暂停</button> : <button onClick={() => void run(onResume)} disabled={working} type="button">继续</button>}<button className="pet-danger-action" onClick={() => void run(onComplete)} disabled={working} type="button">完成</button></div></div>;
}
