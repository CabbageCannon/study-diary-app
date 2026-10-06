import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, createStudySession, updateStudySession } from "../services/api";
import {
  loadPendingEvents,
  loadStudySessionSyncMap,
  PENDING_EVENTS_CHANGED_EVENT,
  removeStudySessionRemoteId,
  savePendingEvents,
  saveStudySessionRemoteId,
} from "../services/storage";
import type { PendingStudyEvent } from "../types";

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return "访问码无效，学习记录正在等待重新配置。";
  if (error instanceof Error && error.message === "等待创建学习会话") return "学习记录正在等待创建会话后同步。";
  return "学习记录同步失败，将在稍后重试。";
}

function logStudySync(message: string, details?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.info(`[desktop-pet][study-sync] ${message}`, details ?? "");
}

export function useOfflineSync(
  accessToken: string,
  authReady: boolean,
  onStartSynced: (localSessionId: string, remoteSessionId: string) => void,
  onCompleteSynced: () => void,
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const isSyncingRef = useRef(false);

  const refreshCount = useCallback(async () => setPendingCount((await loadPendingEvents()).length), []);

  const flush = useCallback(async () => {
    if (!authReady || isSyncingRef.current) return;
    const events = await loadPendingEvents();
    if (!events.length) {
      setPendingCount(0);
      setError("");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    const resolvedSessions = new Map(Object.entries(await loadStudySessionSyncMap()));
    const remaining: PendingStudyEvent[] = [];
    try {
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        try {
          if (event.type === "start") {
            const payload = event.payload as {
              localSessionId: string;
              client_event_id: string;
              activity_type: string;
              title: string;
              started_at: string;
            };
            const remote = await createStudySession(accessToken, payload);
            resolvedSessions.set(payload.localSessionId, remote.id);
            await saveStudySessionRemoteId(payload.localSessionId, remote.id);
            onStartSynced(payload.localSessionId, remote.id);
            logStudySync("start synced", { localSessionId: payload.localSessionId, remoteSessionId: remote.id });
          } else {
            const payload = event.payload as {
              localSessionId: string;
              remoteSessionId: string | null;
              accumulated_seconds: number;
              occurred_at: string;
            };
            const remoteSessionId = payload.remoteSessionId ?? resolvedSessions.get(payload.localSessionId);
            if (!remoteSessionId) throw new Error("等待创建学习会话");
            await updateStudySession(accessToken, remoteSessionId, event.type, {
              accumulated_seconds: payload.accumulated_seconds,
              occurred_at: payload.occurred_at,
            });
            if (event.type === "complete") {
              await removeStudySessionRemoteId(payload.localSessionId);
              logStudySync("complete synced", { localSessionId: payload.localSessionId, remoteSessionId });
              onCompleteSynced();
            }
          }
        } catch (eventError) {
          remaining.push({ ...event, retryCount: event.retryCount + 1 });
          remaining.push(...events.slice(index + 1));
          setError(errorMessage(eventError));
          break;
        }
      }
      await savePendingEvents(remaining);
      setPendingCount(remaining.length);
      if (!remaining.length) setError("");
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [accessToken, authReady, onCompleteSynced, onStartSynced]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    const onPendingEventsChanged = () => {
      void refreshCount();
      void flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener(PENDING_EVENTS_CHANGED_EVENT, onPendingEventsChanged);
    const interval = window.setInterval(() => void flush(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener(PENDING_EVENTS_CHANGED_EVENT, onPendingEventsChanged);
      window.clearInterval(interval);
    };
  }, [flush, refreshCount]);

  return { pendingCount, isSyncing, error, flush, refreshCount };
}
