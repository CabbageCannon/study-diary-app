import { useCallback, useEffect, useMemo, useState } from "react";

import { createStudySession, updateStudySession } from "../services/api";
import { loadPendingEvents, loadStudyTimer, savePendingEvents, saveStudyTimer } from "../services/storage";
import { elapsedSeconds } from "../state/selectors";
import type { PendingStudyEvent, StudyActivityType, StudyTimerState } from "../types";

function createId() {
  return crypto.randomUUID();
}

function makePendingEvent(
  type: PendingStudyEvent["type"],
  payload: Record<string, unknown>,
  occurredAt = new Date().toISOString(),
): PendingStudyEvent {
  return { clientEventId: createId(), type, occurredAt, payload, retryCount: 0 };
}

export function useStudyTimer(accessToken: string) {
  const [timer, setTimer] = useState<StudyTimerState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    void loadStudyTimer().then(setTimer);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const persist = useCallback((next: StudyTimerState | null) => {
    setTimer(next);
    void saveStudyTimer(next);
  }, []);

  const enqueue = useCallback(async (event: PendingStudyEvent) => {
    const events = await loadPendingEvents();
    await savePendingEvents([...events, event]);
  }, []);

  const start = useCallback(async (activityType: StudyActivityType, title: string) => {
    if (timer) return;
    const timestamp = Date.now();
    const localSessionId = createId();
    const next: StudyTimerState = {
      localSessionId,
      remoteSessionId: null,
      clientEventId: localSessionId,
      activityType,
      title: title.trim() || "自主学习",
      status: "running",
      startedAt: timestamp,
      lastResumedAt: timestamp,
      accumulatedSeconds: 0,
      triggeredMilestones: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    persist(next);
    const payload = { client_event_id: next.clientEventId, activity_type: next.activityType, title: next.title, started_at: new Date(timestamp).toISOString() };
    if (!accessToken) {
      await enqueue(makePendingEvent("start", { localSessionId, ...payload }));
      return;
    }
    try {
      const remote = await createStudySession(accessToken, payload);
      persist({ ...next, remoteSessionId: remote.id, updatedAt: Date.now() });
      setSyncError("");
    } catch (error) {
      await enqueue(makePendingEvent("start", { localSessionId, ...payload }));
      setSyncError(error instanceof Error ? error.message : "开始事件待同步。");
    }
  }, [accessToken, enqueue, persist, timer]);

  const sendAction = useCallback(async (
    type: "pause" | "resume" | "complete" | "abandon",
    current: StudyTimerState,
    accumulatedSeconds: number,
    nextTimer: StudyTimerState | null,
  ) => {
    const occurredAt = new Date().toISOString();
    const payload = { localSessionId: current.localSessionId, remoteSessionId: current.remoteSessionId, accumulated_seconds: accumulatedSeconds, occurred_at: occurredAt };
    persist(nextTimer);
    if (!current.remoteSessionId || !accessToken) {
      await enqueue(makePendingEvent(type, payload, occurredAt));
      return;
    }
    try {
      await updateStudySession(accessToken, current.remoteSessionId, type, { accumulated_seconds: accumulatedSeconds, occurred_at: occurredAt });
      setSyncError("");
    } catch (error) {
      await enqueue(makePendingEvent(type, payload, occurredAt));
      setSyncError(error instanceof Error ? error.message : "学习事件待同步。");
    }
  }, [accessToken, enqueue, persist]);

  const pause = useCallback(async () => {
    if (!timer || timer.status !== "running") return;
    const seconds = elapsedSeconds(timer);
    const next = { ...timer, status: "paused" as const, accumulatedSeconds: seconds, lastResumedAt: null, updatedAt: Date.now() };
    await sendAction("pause", timer, seconds, next);
  }, [sendAction, timer]);

  const resume = useCallback(async () => {
    if (!timer || timer.status !== "paused") return;
    const timestamp = Date.now();
    const next = { ...timer, status: "running" as const, lastResumedAt: timestamp, updatedAt: timestamp };
    await sendAction("resume", timer, timer.accumulatedSeconds, next);
  }, [sendAction, timer]);

  const complete = useCallback(async () => {
    if (!timer) return;
    const seconds = elapsedSeconds(timer);
    await sendAction("complete", timer, seconds, null);
  }, [sendAction, timer]);

  const markTriggeredMilestones = useCallback((minutes: number[]) => {
    if (!timer) return;
    const triggeredMilestones = Array.from(new Set([...timer.triggeredMilestones, ...minutes])).sort((a, b) => a - b);
    persist({ ...timer, triggeredMilestones, updatedAt: Date.now() });
  }, [persist, timer]);

  const setRemoteSessionId = useCallback((localSessionId: string, remoteSessionId: string) => {
    setTimer((current) => {
      if (!current || current.localSessionId !== localSessionId || current.remoteSessionId === remoteSessionId) return current;
      const next = { ...current, remoteSessionId, updatedAt: Date.now() };
      void saveStudyTimer(next);
      return next;
    });
  }, []);

  const elapsed = useMemo(() => elapsedSeconds(timer, now), [now, timer]);
  return { timer, elapsed, syncError, start, pause, resume, complete, markTriggeredMilestones, setRemoteSessionId };
}
