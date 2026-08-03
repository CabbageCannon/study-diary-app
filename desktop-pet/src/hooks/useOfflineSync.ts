import { useCallback, useEffect, useState } from "react";

import { createStudySession, updateStudySession } from "../services/api";
import { loadPendingEvents, savePendingEvents } from "../services/storage";
import type { PendingStudyEvent } from "../types";

export function useOfflineSync(accessToken: string, onStartSynced: (localSessionId: string, remoteSessionId: string) => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshCount = useCallback(async () => setPendingCount((await loadPendingEvents()).length), []);

  const flush = useCallback(async () => {
    if (!accessToken || isSyncing) return;
    const events = await loadPendingEvents();
    if (!events.length) {
      setPendingCount(0);
      return;
    }
    setIsSyncing(true);
    const resolvedSessions = new Map<string, string>();
    const remaining: PendingStudyEvent[] = [];
    for (const event of events) {
      try {
        if (event.type === "start") {
          const payload = event.payload as { localSessionId: string; client_event_id: string; activity_type: string; title: string; started_at: string };
          const remote = await createStudySession(accessToken, payload);
          resolvedSessions.set(payload.localSessionId, remote.id);
          onStartSynced(payload.localSessionId, remote.id);
        } else {
          const payload = event.payload as { localSessionId: string; remoteSessionId: string | null; accumulated_seconds: number; occurred_at: string };
          const remoteSessionId = payload.remoteSessionId ?? resolvedSessions.get(payload.localSessionId);
          if (!remoteSessionId) throw new Error("等待创建学习会话");
          await updateStudySession(accessToken, remoteSessionId, event.type, {
            accumulated_seconds: payload.accumulated_seconds,
            occurred_at: payload.occurred_at,
          });
        }
      } catch {
        remaining.push({ ...event, retryCount: event.retryCount + 1 });
        remaining.push(...events.slice(events.indexOf(event) + 1));
        break;
      }
    }
    await savePendingEvents(remaining);
    setPendingCount(remaining.length);
    setIsSyncing(false);
  }, [accessToken, isSyncing, onStartSynced]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => void flush(), 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [flush]);

  return { pendingCount, isSyncing, flush, refreshCount };
}
