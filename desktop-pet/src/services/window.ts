import { invoke } from "@tauri-apps/api/core";
import { availableMonitors, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

import { saveWindowPreferences } from "./storage";
import type { LocalWindowPreferences } from "../types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function applyWindowPreferences(preferences: LocalWindowPreferences): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("apply_window_preferences", {
    alwaysOnTop: preferences.alwaysOnTop,
    mouseThrough: preferences.mouseThrough,
  });
  if (preferences.autostart) await enable();
  else await disable();
  await invoke("set_autostart_checked", { enabled: preferences.autostart });
}

export async function restoreWindowPreferences(preferences: LocalWindowPreferences): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;
  await applyWindowPreferences(preferences);
  const appWindow = getCurrentWindow();
  if (preferences.position) {
    const monitors = await availableMonitors();
    const saved = preferences.position;
    const visible = monitors.find((monitor) => (
      saved.x >= monitor.position.x
      && saved.x <= monitor.position.x + monitor.size.width - 40
      && saved.y >= monitor.position.y
      && saved.y <= monitor.position.y + monitor.size.height - 40
    ));
    const target = visible
      ? saved
      : monitors[0]
        ? { x: monitors[0].position.x + 24, y: monitors[0].position.y + 24 }
        : null;
    if (target) await appWindow.setPosition(new PhysicalPosition(target.x, target.y));
  }
  let timer: number | null = null;
  const unlisten = await appWindow.onMoved(async () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const position = await appWindow.outerPosition();
      const next = { ...preferences, position: { x: position.x, y: position.y } };
      await saveWindowPreferences(next);
    }, 600);
  });
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    unlisten();
  };
}

export async function readAutostartState(): Promise<boolean> {
  return isTauriRuntime() ? isEnabled() : false;
}

export async function updateTrayStudyStatus(status: "idle" | "running" | "paused"): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("update_study_status", { studyStatus: status });
}
