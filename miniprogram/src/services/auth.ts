import Taro from "@tarojs/taro";
import { API_BASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config";

const TOKEN_KEY = "study-diary:mini-token";
const EXPIRY_KEY = "study-diary:mini-token-expiry";

type TokenResponse = { access_token: string; expires_in: number };

function saveToken(result: TokenResponse) {
  Taro.setStorageSync(TOKEN_KEY, result.access_token);
  Taro.setStorageSync(EXPIRY_KEY, Date.now() + result.expires_in * 1000);
}

export function hasMiniToken() {
  return Boolean(Taro.getStorageSync<string>(TOKEN_KEY)) && Number(Taro.getStorageSync<number>(EXPIRY_KEY)) > Date.now() + 30_000;
}

export function getMiniToken() { return Taro.getStorageSync<string>(TOKEN_KEY) || ""; }

export function clearMiniSession() {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(EXPIRY_KEY);
}

async function wechatCode() {
  const result = await Taro.login();
  if (!result.code) throw new Error("微信授权未返回登录凭据，请重试。");
  return result.code;
}

async function miniAuth(path: string, create = false, accessToken = "") {
  const code = await wechatCode();
  const result = await Taro.request<TokenResponse | { detail?: { message?: string } | string }>({
    url: `${API_BASE_URL}${path}`,
    method: "POST",
    header: { "content-type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    data: { code, create },
  });
  if (result.statusCode < 200 || result.statusCode >= 300 || !("access_token" in result.data)) {
    const detail = "detail" in result.data ? result.data.detail : "微信登录失败，请稍后再试。";
    throw new Error(typeof detail === "string" ? detail : detail?.message || "微信登录失败，请稍后再试。");
  }
  saveToken(result.data);
}

export async function loginWithWechat(create = false) { await miniAuth("/api/auth/wechat/login", create); }

export async function bindExistingEmail(email: string, password: string) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("小程序尚未配置账户绑定服务。");
  const signIn = await Taro.request<{ access_token?: string; error_description?: string }>({
    url: `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    method: "POST",
    header: { apikey: SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    data: { email, password },
  });
  if (signIn.statusCode !== 200 || !signIn.data.access_token) throw new Error(signIn.data.error_description || "邮箱或密码不正确。");
  await miniAuth("/api/auth/wechat/bind", false, signIn.data.access_token);
}
