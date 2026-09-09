import type { CreateDiaryDraftPayload, Diary, DiaryDraft, MobileDiaryPayload, RewriteDiaryDraftPayload, SaveDiaryPayload, UpdateDiaryPayload } from "../types/diary";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const ACCESS_TOKEN_STORAGE_KEY = "study-diary:access-token";
const API_CACHE_PREFIX = "study-diary:api-cache:";
const DEFAULT_CACHE_AGE = 5 * 60 * 1000;
export const ACCESS_TOKEN_CHANGED_EVENT = "study-diary:access-token-changed";

type CachedValue = { storedAt: number; value: unknown };
const memoryCache = new Map<string, CachedValue>();
const pendingRequests = new Map<string, Promise<unknown>>();

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getAccessToken() {
  return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)?.trim() ?? "";
}

export function saveAccessToken(value: string) {
  const nextValue = value.trim();
  if (nextValue) {
    window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, nextValue);
  } else {
    window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(ACCESS_TOKEN_CHANGED_EVENT));
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
    throw new ApiRequestError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function readCachedValue<T>(path: string, maxAgeMs: number): T | null {
  let cached = memoryCache.get(path);
  if (!cached) {
    try {
      const raw = window.localStorage.getItem(`${API_CACHE_PREFIX}${path}`);
      cached = raw ? JSON.parse(raw) as CachedValue : undefined;
      if (cached) memoryCache.set(path, cached);
    } catch {
      cached = undefined;
    }
  }
  return cached && Date.now() - cached.storedAt <= maxAgeMs ? cached.value as T : null;
}

export function peekCachedRequest<T>(path: string, maxAgeMs = DEFAULT_CACHE_AGE): T | null {
  return readCachedValue<T>(path, maxAgeMs);
}

export function primeCachedRequest<T>(path: string, value: T) {
  const cached = { storedAt: Date.now(), value } satisfies CachedValue;
  memoryCache.set(path, cached);
  try {
    window.localStorage.setItem(`${API_CACHE_PREFIX}${path}`, JSON.stringify(cached));
  } catch {
    // Memory cache still keeps the current session fast when storage is full.
  }
}

export function invalidateCachedRequests(...pathPrefixes: string[]) {
  for (const path of memoryCache.keys()) {
    if (pathPrefixes.some((prefix) => path.startsWith(prefix))) memoryCache.delete(path);
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(API_CACHE_PREFIX)) continue;
      const path = key.slice(API_CACHE_PREFIX.length);
      if (pathPrefixes.some((prefix) => path.startsWith(prefix))) window.localStorage.removeItem(key);
    }
  } catch {
    // Local storage can be unavailable in private browsing; memory cache is enough.
  }
}

export function cachedRequest<T>(path: string, maxAgeMs = DEFAULT_CACHE_AGE, force = false): Promise<T> {
  const cached = force ? null : readCachedValue<T>(path, maxAgeMs);
  if (cached !== null) return Promise.resolve(cached);
  const pending = pendingRequests.get(path) as Promise<T> | undefined;
  if (pending) return pending;

  const requestPromise = request<T>(path)
    .then((value) => {
      primeCachedRequest(path, value);
      return value;
    })
    .catch((error) => {
      const stale = readCachedValue<T>(path, Number.POSITIVE_INFINITY);
      if (stale !== null) return stale;
      throw error;
    })
    .finally(() => pendingRequests.delete(path));
  pendingRequests.set(path, requestPromise);
  return requestPromise;
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

export function listDiaries(force = false): Promise<Diary[]> {
  return cachedRequest<Diary[]>("/api/diaries", undefined, force).then((items) => {
    const normalized = items.map(normalizeDiary);
    primeCachedRequest("/api/diaries", normalized);
    return normalized;
  });
}

export function peekDiaries() {
  return peekCachedRequest<Diary[]>("/api/diaries")?.map(normalizeDiary) ?? null;
}

export function getDiary(id: number): Promise<Diary> {
  return request<Diary>(`/api/diaries/${id}`).then(normalizeDiary);
}

function normalizeDiary(diary: Diary): Diary {
  return {
    ...diary,
    category: diary.category ?? "learning",
    status: diary.status ?? "published",
    images: Array.isArray(diary.images) ? diary.images : [],
    weather: diary.weather ?? null,
    location: diary.location ?? null,
    is_pinned: Boolean(diary.is_pinned),
  };
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

export function saveDiary(payload: SaveDiaryPayload | MobileDiaryPayload): Promise<Diary> {
  return request<Diary>("/api/diaries", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((diary) => {
    const current = peekDiaries() ?? [];
    primeCachedRequest("/api/diaries", [diary, ...current.filter((item) => item.id !== diary.id)]);
    return diary;
  });
}

export function updateDiary(id: number, payload: UpdateDiaryPayload): Promise<Diary> {
  return request<Diary>(`/api/diaries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((diary) => {
    const current = peekDiaries() ?? [];
    primeCachedRequest("/api/diaries", [diary, ...current.filter((item) => item.id !== diary.id)]);
    return diary;
  });
}

export function deleteDiary(id: number): Promise<void> {
  return request<void>(`/api/diaries/${id}`, {
    method: "DELETE",
  }).then(() => primeCachedRequest("/api/diaries", (peekDiaries() ?? []).filter((item) => item.id !== id)));
}
