import { openUrl } from "@tauri-apps/plugin-opener";

import type { StudyActivityType } from "../types";

const baseUrl = import.meta.env.VITE_STUDY_APP_BASE_URL ?? "http://127.0.0.1:5173";

const pathForActivity: Record<StudyActivityType, string> = {
  algorithm: "/algorithms",
  interview: "/interview",
  diary: "/write",
  reading: "/",
  course: "/",
  custom: "/",
};

function safeUrl(path: string): string {
  const url = new URL(path, baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("学习系统地址只能使用 http 或 https。");
  }
  return url.toString();
}

export function openStudyApp(path = "/"): Promise<void> {
  return openUrl(safeUrl(path));
}

export function openActivityPage(activity: StudyActivityType): Promise<void> {
  return openStudyApp(pathForActivity[activity]);
}
