import type { DesktopPetConfig, DesktopPetWeather, StudySessionRemote } from "../types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, accessToken: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "X-Study-Diary-Access": accessToken } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = response.statusText || "请求失败";
    try {
      const body = await response.json() as { detail?: string };
      message = body.detail ?? message;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export const getDesktopPetConfig = (token: string) => request<DesktopPetConfig>("/api/desktop-pet/config", token);
export const getDesktopPetWeather = (token: string) => request<DesktopPetWeather>("/api/desktop-pet/weather", token);

export const createStudySession = (
  token: string,
  payload: { client_event_id: string; activity_type: string; title: string; started_at: string },
) => request<StudySessionRemote>("/api/study-sessions", token, { method: "POST", body: JSON.stringify(payload) });

export const updateStudySession = (
  token: string,
  sessionId: string,
  action: "pause" | "resume" | "complete" | "abandon",
  payload: { accumulated_seconds: number; occurred_at: string },
) => request<StudySessionRemote>(`/api/study-sessions/${sessionId}/${action}`, token, {
  method: action === "pause" || action === "resume" ? "PATCH" : "POST",
  body: JSON.stringify(payload),
});
