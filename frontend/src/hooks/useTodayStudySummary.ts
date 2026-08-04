import { useCallback, useEffect, useRef, useState } from "react";

import { getDesktopPetDashboard } from "../api/desktopPet";
import type { DesktopPetDashboard } from "../types/desktopPet";

const REFRESH_INTERVAL_MS = 20_000;

export function useTodayStudySummary() {
  const [summary, setSummary] = useState<DesktopPetDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const next = await getDesktopPetDashboard(controller.signal);
      if (controller.signal.aborted) return;
      setSummary(next);
      setError("");
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "学习统计暂时不可用");
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      inFlightRef.current = false;
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
      abortControllerRef.current?.abort();
    };
  }, [refresh]);

  return { summary, isLoading, error, refresh };
}
