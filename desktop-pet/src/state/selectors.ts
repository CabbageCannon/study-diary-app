import type { PetRuntimeState, PetVisualState, StudyTimerState } from "../types";

export function resolveVisualState(state: Pick<PetRuntimeState, "transientState" | "studyStatus" | "weatherState">): PetVisualState {
  if (state.transientState === "milestone") return "milestone";
  if (state.studyStatus === "running") return "studying";
  if (state.weatherState === "rain") return "rain";
  return "idle";
}

export function elapsedSeconds(timer: StudyTimerState | null, now = Date.now()): number {
  if (!timer) return 0;
  if (timer.status !== "running" || timer.lastResumedAt === null) return timer.accumulatedSeconds;
  return Math.max(timer.accumulatedSeconds, timer.accumulatedSeconds + Math.floor((now - timer.lastResumedAt) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
