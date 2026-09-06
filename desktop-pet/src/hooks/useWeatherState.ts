import { useCallback, useEffect, useRef, useState } from "react";

import { getDesktopPetWeather } from "../services/api";
import type { DesktopPetConfig, DesktopPetWeather, WeatherState } from "../types";

export function useWeatherState(config: DesktopPetConfig, accessToken: string, authReady: boolean) {
  const [weather, setWeather] = useState<DesktopPetWeather | null>(null);
  const [weatherState, setWeatherState] = useState<WeatherState>("unknown");
  const latestCandidate = useRef<WeatherState | null>(null);
  const matchingCount = useRef(0);

  const applyCandidate = useCallback((candidate: WeatherState) => {
    if (weatherState === "unknown") {
      setWeatherState(candidate);
      latestCandidate.current = candidate;
      matchingCount.current = 1;
      return;
    }
    if (latestCandidate.current === candidate) {
      matchingCount.current += 1;
    } else {
      latestCandidate.current = candidate;
      matchingCount.current = 1;
    }
    if (matchingCount.current >= 2) setWeatherState(candidate);
  }, [weatherState]);

  useEffect(() => {
    if (!config.weather_enabled || !authReady) {
      setWeather(null);
      setWeatherState("unknown");
      return undefined;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const next = await getDesktopPetWeather(accessToken);
        if (cancelled) return;
        setWeather(next);
        applyCandidate(next.is_raining ? "rain" : "clear");
      } catch {
        // The last confirmed state is intentionally retained on provider errors.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), config.weather_refresh_minutes * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, applyCandidate, authReady, config.weather_enabled, config.weather_refresh_minutes]);

  return { weather, weatherState };
}
