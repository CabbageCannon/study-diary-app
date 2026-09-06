import { useEffect } from "react";

import { acknowledgeDesktopPetShow, ApiError, getDesktopPetControl } from "../services/api";
import { showPetWindow } from "../services/window";

const POLL_INTERVAL_MS = 2_500;
const MAX_RETRY_DELAY_MS = 30_000;

export function useDesktopPetControl(accessToken: string, authReady: boolean) {
  useEffect(() => {
    if (!authReady) return undefined;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let retryDelay = POLL_INTERVAL_MS;
    let stoppedByUnauthorized = false;

    const schedule = (delay: number) => {
      if (!cancelled && !stoppedByUnauthorized) timer = window.setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (cancelled || stoppedByUnauthorized || controller) return;
      controller = new AbortController();
      try {
        const state = await getDesktopPetControl(accessToken, controller.signal);
        retryDelay = POLL_INTERVAL_MS;
        if (state.show_request_pending && state.show_request_version > state.show_acknowledged_version) {
          await showPetWindow();
          if (!cancelled) await acknowledgeDesktopPetShow(accessToken, state.show_request_version, controller.signal);
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        if (error instanceof ApiError && error.status === 401) {
          stoppedByUnauthorized = true;
          console.warn("[desktop-pet] Desktop control polling stopped because the access code is no longer valid.");
          return;
        }
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
        console.warn("[desktop-pet] Desktop control polling failed; retrying with backoff.", error);
      } finally {
        controller = null;
        schedule(retryDelay);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [accessToken, authReady]);
}
