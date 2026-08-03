import type { CreateDiaryDraftPayload, Diary, DiaryDraft, RewriteDiaryDraftPayload, SaveDiaryPayload } from "../types/diary";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const ACCESS_TOKEN_STORAGE_KEY = "study-diary:access-token";

function getAccessToken() {
  return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)?.trim() ?? "";
}

export function saveAccessToken(value: string) {
  const nextValue = value.trim();
  if (nextValue) {
    window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, nextValue);
    return;
  }
  window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function hasAccessToken() {
  return Boolean(getAccessToken());
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const accessToken = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "X-Study-Diary-Access": accessToken } : {}),
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map(formatApiErrorItem).join("；");
    }
  } catch {
    // Fall back to status text below.
  }

  return response.statusText || "请求失败，请稍后重试";
}

function formatApiErrorItem(item: unknown): string {
  if (typeof item === "object" && item !== null && "msg" in item) {
    return String((item as { msg: unknown }).msg);
  }

  return JSON.stringify(item);
}

export function listDiaries(): Promise<Diary[]> {
  return request<Diary[]>("/api/diaries");
}

export function getDiary(id: number): Promise<Diary> {
  return request<Diary>(`/api/diaries/${id}`);
}

export function createDiaryDraft(payload: CreateDiaryDraftPayload): Promise<DiaryDraft> {
  return request<DiaryDraft>("/api/diaries/draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rewriteDiaryDraft(payload: RewriteDiaryDraftPayload): Promise<DiaryDraft> {
  return request<DiaryDraft>("/api/diaries/draft/rewrite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveDiary(payload: SaveDiaryPayload): Promise<Diary> {
  return request<Diary>("/api/diaries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteDiary(id: number): Promise<void> {
  return request<void>(`/api/diaries/${id}`, {
    method: "DELETE",
  });
}
