import { openUrl } from "@tauri-apps/plugin-opener";

import type { StudyActivityType } from "../types";

export type StudyRouteKey = "dashboard" | "diary" | "interview" | "algorithms" | "desktopPetSettings";

const DEFAULT_STUDY_APP_BASE_URL = "http://127.0.0.1:5173";

const routes: Record<StudyRouteKey, { label: string; path: string }> = {
  dashboard: { label: "今日概况", path: "/write" },
  diary: { label: "学习日记", path: "/write" },
  interview: { label: "八股训练", path: "/interview" },
  algorithms: { label: "算法训练", path: "/algorithms" },
  desktopPetSettings: { label: "Web 桌宠设置", path: "/settings/desktop-pet" },
};

const routeForActivity: Record<StudyActivityType, StudyRouteKey> = {
  algorithm: "algorithms",
  interview: "interview",
  diary: "diary",
  reading: "dashboard",
  course: "dashboard",
  custom: "dashboard",
};

export function getStudyAppBaseUrl(): string {
  const configured = (import.meta.env.VITE_STUDY_APP_BASE_URL ?? DEFAULT_STUDY_APP_BASE_URL).trim();
  const base = configured || DEFAULT_STUDY_APP_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`学习系统基础地址无效：${base}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("学习系统地址只能使用 http 或 https。");
  }
  if (import.meta.env.PROD && parsed.protocol !== "https:") {
    console.warn("[desktop-pet] Production desktop pet is using a non-HTTPS study app URL.", parsed.toString());
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function getStudyRouteUrl(routeKey: StudyRouteKey): string {
  const route = routes[routeKey];
  return `${getStudyAppBaseUrl()}/${route.path.replace(/^\/+/, "")}`;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openStudyRoute(routeKey: StudyRouteKey): Promise<void> {
  const route = routes[routeKey];
  const url = getStudyRouteUrl(routeKey);
  try {
    if (isTauriRuntime()) {
      await openUrl(url);
      return;
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("浏览器阻止了新窗口，请允许弹出窗口后重试。");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法打开“${route.label}”（基础地址：${getStudyAppBaseUrl()}）。请确认主前端已启动且地址配置正确。${reason}`);
  }
}

export function openActivityPage(activity: StudyActivityType): Promise<void> {
  return openStudyRoute(routeForActivity[activity]);
}
