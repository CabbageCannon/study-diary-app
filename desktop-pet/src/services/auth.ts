import { invoke } from "@tauri-apps/api/core";

let accessToken = "";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getAccessToken(): string {
  return accessToken;
}

export async function loadAccessToken(): Promise<string> {
  if (!isTauriRuntime()) return accessToken;
  const stored = await invoke<string | null>("load_access_token");
  accessToken = stored?.trim() ?? "";
  return accessToken;
}

export async function setAccessToken(value: string): Promise<void> {
  const next = value.trim();
  if (!next) throw new Error("访问码不能为空");
  if (isTauriRuntime()) await invoke("save_access_token", { accessToken: next });
  accessToken = next;
}

export async function clearAccessToken(): Promise<void> {
  if (isTauriRuntime()) await invoke("clear_access_token");
  accessToken = "";
}

export function hasAccessToken(): boolean {
  return Boolean(accessToken);
}
