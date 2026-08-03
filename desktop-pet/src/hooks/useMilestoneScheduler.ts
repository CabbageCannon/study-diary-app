import { useEffect } from "react";

import type { StudyTimerState } from "../types";

interface UseMilestoneSchedulerOptions {
  timer: StudyTimerState | null;
  elapsed: number;
  milestones: number[];
  onMilestone: (largestMinutes: number, crossedMinutes: number[]) => void;
}

export function useMilestoneScheduler({ timer, elapsed, milestones, onMilestone }: UseMilestoneSchedulerOptions) {
  useEffect(() => {
    if (!timer || timer.status !== "running") return;
    const elapsedMinutes = Math.floor(elapsed / 60);
    const crossed = milestones.filter((minutes) => minutes <= elapsedMinutes && !timer.triggeredMilestones.includes(minutes));
    if (!crossed.length) return;
    onMilestone(crossed[crossed.length - 1], crossed);
  }, [elapsed, milestones, onMilestone, timer]);
}
