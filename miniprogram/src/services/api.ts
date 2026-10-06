import Taro from "@tarojs/taro";
import { API_BASE_URL } from "../config";
import { clearMiniSession, getMiniToken } from "./auth";

export type ApiError = Error & { status?: number };

export async function api<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; data?: unknown } = {}): Promise<T> {
  const result = await Taro.request<T | { detail?: string }>({
    url: `${API_BASE_URL}${path}`,
    method: options.method || "GET",
    header: { Authorization: `Bearer ${getMiniToken()}`, "content-type": "application/json" },
    data: options.data,
  });
  if (result.statusCode === 401 || result.statusCode === 403) {
    clearMiniSession();
    Taro.reLaunch({ url: "/pages/auth/index" });
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const error = new Error((result.data as { detail?: string }).detail || "请求失败，请稍后重试。") as ApiError;
    error.status = result.statusCode;
    throw error;
  }
  return result.data as T;
}
