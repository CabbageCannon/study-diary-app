import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "../api/client";
import { getDesktopPetDashboard } from "../api/desktopPet";
import { useAccessToken } from "../auth/AccessTokenContext";
import type { DesktopPetDashboard } from "../types/desktopPet";

const REFRESH_INTERVAL_MS = 8_000;

export type TodayStudySummaryError = "unauthorized" | "forbidden" | "validation" | "server" | "network" | "unknown";

function classifyError(reason: unknown): TodayStudySummaryError {
  if (reason instanceof ApiRequestError) {
    if (reason.status === 401) return "unauthorized";
    if (reason.status === 403) return "forbidden";
    if (reason.status === 422) return "validation";
    if (reason.status >= 500) return "server";
  }
  if (reason instanceof TypeError) return "network";
  return "unknown";
}

export function useTodayStudySummary() {
  const [summary, setSummary] = useState<DesktopPetDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<TodayStudySummaryError | null>(null);
  const { accessTokenVersion } = useAccessToken();
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
      setError(null);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(classifyError(reason));
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      inFlightRef.current = false;
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL_MS);
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
  }, [accessTokenVersion, refresh]);

  return { summary, isLoading, error, refresh };
}
