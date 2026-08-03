import { useCallback, useEffect, useState } from "react";

import { getDesktopPetConfig } from "../services/api";
import { loadCachedConfig, saveCachedConfig } from "../services/storage";
import type { DesktopPetConfig } from "../types";

export const defaultDesktopPetConfig: DesktopPetConfig = {
  weather_enabled: true,
  location_label: "",
  latitude: null,
  longitude: null,
  weather_refresh_minutes: 15,
  milestone_minutes: [10, 20, 50],
  milestone_display_seconds: 10,
  show_notifications: true,
  open_page_on_study_start: false,
  updated_at: "",
};

export function useDesktopPetConfig(accessToken: string) {
  const [config, setConfig] = useState<DesktopPetConfig>(defaultDesktopPetConfig);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const next = await getDesktopPetConfig(accessToken);
      setConfig(next);
      await saveCachedConfig(next);
      setError("");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "桌宠配置同步失败。");
    }
  }, [accessToken]);

  useEffect(() => {
    void loadCachedConfig().then((cached) => {
      if (cached) setConfig(cached);
    });
  }, []);

  useEffect(() => {
    void refresh();
    if (!accessToken) return undefined;
    const timer = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, refresh]);

  return { config, error, refresh };
}
