import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, createStudySession, updateStudySession } from "../services/api";
import {
  loadPendingEvents,
  loadStudyTimer,
  removeStudySessionRemoteId,
  savePendingEvents,
  saveStudySessionRemoteId,
  saveStudyTimer,
} from "../services/storage";
import { elapsedSeconds } from "../state/selectors";
import type { PendingStudyEvent, StudyActivityType, StudyTimerState } from "../types";

type SyncResult = "synced" | "queued";

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

function syncErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) return "访问码无效，请在桌宠设置中更新后重试。";
  return error instanceof Error ? error.message : fallback;
}

function logStudySync(message: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.info(`[desktop-pet][study-sync] ${message}`, details ?? "");
}

export function useStudyTimer(accessToken: string, authReady: boolean) {
  const [timer, setTimer] = useState<StudyTimerState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [syncError, setSyncError] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionNotice, setCompletionNotice] = useState("");
  const completingRef = useRef(false);

  useEffect(() => {
    void loadStudyTimer().then(setTimer);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const persist = useCallback((next: StudyTimerState | null) => {
    setTimer(next);
    return saveStudyTimer(next);
  }, []);

  const enqueue = useCallback(async (event: PendingStudyEvent) => {
    const events = await loadPendingEvents();
    await savePendingEvents([...events, event]);
  }, []);

  const start = useCallback(async (activityType: StudyActivityType, title: string) => {
    if (timer) return;
    if (!authReady) {
      setSyncError("正在读取系统凭据，请稍后再开始学习。");
      return;
    }
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
    const payload = {
      client_event_id: next.clientEventId,
      activity_type: next.activityType,
      title: next.title,
      started_at: new Date(timestamp).toISOString(),
    };
    await persist(next);
    logStudySync("start requested", { localSessionId });
    try {
      const remote = await createStudySession(accessToken, payload);
      const synced = { ...next, remoteSessionId: remote.id, updatedAt: Date.now() };
      await persist(synced);
      try {
        await saveStudySessionRemoteId(localSessionId, remote.id);
      } catch (storageError) {
        console.warn("[desktop-pet][study-sync] unable to persist the remote session mapping", storageError);
      }
      setSyncError("");
      logStudySync("start synced", { localSessionId, remoteSessionId: remote.id });
    } catch (error) {
      await enqueue(makePendingEvent("start", { localSessionId, ...payload }));
      setSyncError(syncErrorMessage(error, "开始事件已保存，等待同步。"));
      logStudySync("start queued", { localSessionId, status: error instanceof ApiError ? error.status : undefined });
    }
  }, [accessToken, authReady, enqueue, persist, timer]);

  const sendAction = useCallback(async (
    type: "pause" | "resume" | "complete" | "abandon",
    current: StudyTimerState,
    accumulatedSeconds: number,
    nextTimer: StudyTimerState | null,
  ): Promise<SyncResult> => {
    const occurredAt = new Date().toISOString();
    const payload = {
      localSessionId: current.localSessionId,
      remoteSessionId: current.remoteSessionId,
      accumulated_seconds: accumulatedSeconds,
      occurred_at: occurredAt,
    };
    await persist(nextTimer);
    if (current.remoteSessionId) {
      try {
        await saveStudySessionRemoteId(current.localSessionId, current.remoteSessionId);
      } catch (storageError) {
        console.warn("[desktop-pet][study-sync] unable to update the remote session mapping", storageError);
      }
    }
    if (!authReady || !current.remoteSessionId) {
      await enqueue(makePendingEvent(type, payload, occurredAt));
      if (type === "complete") logStudySync("complete queued", { localSessionId: current.localSessionId, reason: authReady ? "missing-remote-session" : "auth-loading" });
      return "queued";
    }
    try {
      await updateStudySession(accessToken, current.remoteSessionId, type, {
        accumulated_seconds: accumulatedSeconds,
        occurred_at: occurredAt,
      });
      if (type === "complete") await removeStudySessionRemoteId(current.localSessionId);
      setSyncError("");
      if (type === "complete") logStudySync("complete synced", { localSessionId: current.localSessionId, remoteSessionId: current.remoteSessionId });
      return "synced";
    } catch (error) {
      await enqueue(makePendingEvent(type, payload, occurredAt));
      setSyncError(syncErrorMessage(error, "学习事件已保存，等待同步。"));
      if (type === "complete") logStudySync("complete queued", { localSessionId: current.localSessionId, status: error instanceof ApiError ? error.status : undefined });
      return "queued";
    }
  }, [accessToken, authReady, enqueue, persist]);

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
    if (!timer || completingRef.current) return;
    completingRef.current = true;
    setIsCompleting(true);
    setCompletionNotice("");
    try {
      const seconds = elapsedSeconds(timer);
      logStudySync("complete requested", { localSessionId: timer.localSessionId, seconds });
      const result = await sendAction("complete", timer, seconds, null);
      setCompletionNotice(result === "synced" ? "本次学习已记录" : "本次学习已保存在本机，等待同步");
    } catch (error) {
      setSyncError(syncErrorMessage(error, "完成记录保存失败，请检查本机存储。"));
    } finally {
      completingRef.current = false;
      setIsCompleting(false);
    }
  }, [sendAction, timer]);

  const markTriggeredMilestones = useCallback((minutes: number[]) => {
    if (!timer) return;
    const triggeredMilestones = Array.from(new Set([...timer.triggeredMilestones, ...minutes])).sort((a, b) => a - b);
    void persist({ ...timer, triggeredMilestones, updatedAt: Date.now() });
  }, [persist, timer]);

  const setRemoteSessionId = useCallback((localSessionId: string, remoteSessionId: string) => {
    void saveStudySessionRemoteId(localSessionId, remoteSessionId).catch((error) => {
      console.warn("[desktop-pet][study-sync] unable to persist the remote session mapping", error);
    });
    setTimer((current) => {
      if (!current || current.localSessionId !== localSessionId || current.remoteSessionId === remoteSessionId) return current;
      const next = { ...current, remoteSessionId, updatedAt: Date.now() };
      void saveStudyTimer(next);
      return next;
    });
  }, []);

  const markQueuedCompletionSynced = useCallback(() => {
    setSyncError("");
    setCompletionNotice("本次学习已记录");
  }, []);

  const clearCompletionNotice = useCallback(() => setCompletionNotice(""), []);

  const elapsed = useMemo(() => elapsedSeconds(timer, now), [now, timer]);
  return {
    timer,
    elapsed,
    syncError,
    isCompleting,
    completionNotice,
    start,
    pause,
    resume,
    complete,
    markTriggeredMilestones,
    setRemoteSessionId,
    markQueuedCompletionSynced,
    clearCompletionNotice,
  };
}
