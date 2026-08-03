import { useEffect, useMemo, useState } from "react";

export interface AlgorithmAttemptDraft {
  result: "solved" | "partially_solved" | "failed" | "gave_up";
  approach: string;
  timeComplexity: string;
  spaceComplexity: string;
  language: string;
  code: string;
  reflection: string;
  mistakes: string;
  edgeCases: string;
  needsReview: boolean;
}

const emptyDraft: AlgorithmAttemptDraft = {
  result: "partially_solved",
  approach: "",
  timeComplexity: "",
  spaceComplexity: "",
  language: "",
  code: "",
  reflection: "",
  mistakes: "",
  edgeCases: "",
  needsReview: false,
};

function draftStorageKey(sessionId: string, problemId: number) {
  return `study-diary:algorithm:session:${sessionId}:problem:${problemId}:draft`;
}

function timerStorageKey(sessionId: string) {
  return `study-diary:algorithm:session:${sessionId}:timer`;
}

export function useAlgorithmAttemptDraft(sessionId: string, problemId: number) {
  const key = useMemo(() => draftStorageKey(sessionId, problemId), [sessionId, problemId]);
  const [draft, setDraft] = useState<AlgorithmAttemptDraft>(emptyDraft);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) as Partial<AlgorithmAttemptDraft> : null;
      setDraft({ ...emptyDraft, ...(parsed ?? {}) });
    } catch {
      setDraft(emptyDraft);
    }
  }, [key]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(key, JSON.stringify(draft));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draft, key]);

  function clearDraft() {
    window.localStorage.removeItem(key);
    setDraft(emptyDraft);
  }

  return { draft, setDraft, clearDraft };
}

export function useAlgorithmSessionTimer(sessionId: string) {
  const key = useMemo(() => timerStorageKey(sessionId), [sessionId]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) as { elapsedSeconds?: number; isRunning?: boolean; savedAt?: number } : null;
      const storedElapsed = Math.max(0, parsed?.elapsedSeconds ?? 0);
      const storedRunning = parsed?.isRunning ?? true;
      const extra = storedRunning && parsed?.savedAt ? Math.floor((Date.now() - parsed.savedAt) / 1000) : 0;
      setElapsedSeconds(storedElapsed + Math.max(0, extra));
      setIsRunning(storedRunning);
    } catch {
      setElapsedSeconds(0);
      setIsRunning(true);
    }
  }, [key]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify({ elapsedSeconds, isRunning, savedAt: Date.now() }));
  }, [elapsedSeconds, isRunning, key]);

  function resetTimer() {
    setElapsedSeconds(0);
    setIsRunning(false);
    window.localStorage.removeItem(key);
  }

  return { elapsedSeconds, isRunning, setIsRunning, resetTimer };
}

export function formatElapsedTime(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
