import { request } from "../api/client";
import type { TodayWorkspaceData } from "../hooks/useTodayWorkspace";

export interface DailyGoals {
  interview: number;
  algorithm: number;
  diary: number;
  review: number;
}

export interface ReminderSettings {
  enabled: boolean;
  time: string;
  subscriptionId: number | null;
}

export interface UserPreferences {
  nickname: string;
  targetRole: string;
  learningStyle: string;
  dailyGoals: DailyGoals;
  reminder: ReminderSettings;
}

export interface TodayProgressItem {
  key: keyof DailyGoals;
  label: string;
  completed: number;
  target: number;
  href: string;
}

export interface ReminderSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
  reminder_time: string;
  timezone: string;
  interview_goal: number;
  algorithm_goal: number;
  include_diary: boolean;
  include_review: boolean;
}

export interface ReminderSubscriptionResponse extends ReminderSubscriptionPayload {
  id: number;
}

export const USER_PREFERENCES_CHANGED_EVENT = "study-diary:user-preferences-changed";
const USER_PREFERENCES_KEY = "study-diary:user-preferences";
const TIME_ZONE = "Asia/Shanghai";

export const defaultUserPreferences: UserPreferences = {
  nickname: "",
  targetRole: "AI 应用工程师",
  learningStyle: "先口述思路，再看反馈",
  dailyGoals: {
    interview: 3,
    algorithm: 3,
    diary: 1,
    review: 1,
  },
  reminder: {
    enabled: false,
    time: "21:30",
    subscriptionId: null,
  },
};

const dailySentences = [
  "把今天讲清楚，明天就少背一点。",
  "一道题也算数，关键是别让链条断掉。",
  "先说人话，再补术语，面试官也爱听这个。",
  "今天的脑子可能慢，记录会替你守住进度。",
  "复习不是回头路，是把坑填平。",
  "能解释给昨天的自己听，就是真的会了。",
  "别急着赢题，先把题意赢下来。",
  "今天只要开始，系统就会接住后半段。",
];

const reminderOpeners = [
  "今晚还差一点收尾",
  "学习日记来敲门",
  "今天的知识还没完全落袋",
  "给未来的你递个小纸条",
  "先补一小块，今天就不散场",
  "你的复习雷达响了一下",
];

export function getShanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getDailySentence(date = new Date()) {
  const key = getShanghaiDateKey(date);
  const index = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % dailySentences.length;
  return dailySentences[index];
}

export function loadUserPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(USER_PREFERENCES_KEY);
    if (!raw) return defaultUserPreferences;
    const saved = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...defaultUserPreferences,
      ...saved,
      dailyGoals: { ...defaultUserPreferences.dailyGoals, ...saved.dailyGoals },
      reminder: { ...defaultUserPreferences.reminder, ...saved.reminder },
    };
  } catch {
    return defaultUserPreferences;
  }
}

export function saveUserPreferences(value: UserPreferences) {
  window.localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
}

export function clampGoal(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(30, Math.trunc(value)));
}

export function getTodayProgressItems(data: TodayWorkspaceData, preferences: UserPreferences): TodayProgressItem[] {
  const dueCount = (data.algorithmStats?.due_review_count ?? 0) + (data.interviewStats?.due_review_count ?? 0);
  const reviewTarget = preferences.dailyGoals.review;
  const reviewStatsReady = data.algorithmStats !== null || data.interviewStats !== null;
  return [
    {
      key: "interview",
      label: "八股",
      completed: data.interviewStats?.today_answered_count ?? 0,
      target: preferences.dailyGoals.interview,
      href: "/interview",
    },
    {
      key: "algorithm",
      label: "算法",
      completed: data.algorithmStats?.today_completed_count ?? 0,
      target: preferences.dailyGoals.algorithm,
      href: "/algorithms",
    },
    {
      key: "diary",
      label: "日记",
      completed: data.todayDiaryCount,
      target: preferences.dailyGoals.diary,
      href: "/write",
    },
    {
      key: "review",
      label: "复习",
      completed: reviewStatsReady && dueCount === 0 ? reviewTarget : Math.max(0, reviewTarget - dueCount),
      target: reviewTarget,
      href: "/algorithms/review",
    },
  ];
}

export function progressRatio(items: TodayProgressItem[]) {
  const target = items.reduce((sum, item) => sum + item.target, 0);
  if (target <= 0) return 1;
  const completed = items.reduce((sum, item) => sum + Math.min(item.completed, item.target), 0);
  return completed / target;
}

export function buildReminderCopy(items: TodayProgressItem[], date = new Date()) {
  const missing = items.filter((item) => item.target > 0 && item.completed < item.target);
  const seed = [...getShanghaiDateKey(date), ...missing.map((item) => item.key).join("")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const title = reminderOpeners[seed % reminderOpeners.length];

  if (!missing.length) {
    return { title: "今天已经收工", body: "八股、算法、日记和复习都处理好了，可以安心睡觉。" };
  }

  const body = missing
    .map((item) => `${item.label} ${Math.min(item.completed, item.target)}/${item.target}`)
    .join("，");
  return { title, body: `${body}。挑最轻的一项补上就行。` };
}

export function notificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getReminderPublicKey() {
  return request<{ public_key: string }>("/api/reminders/public-key");
}

export async function subscribeReminderPush(settings: ReminderSubscriptionPayload) {
  return request<ReminderSubscriptionResponse>("/api/reminders/subscriptions", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export async function updateReminderPush(subscriptionId: number, settings: Omit<ReminderSubscriptionPayload, "endpoint" | "p256dh" | "auth">) {
  return request<ReminderSubscriptionResponse>(`/api/reminders/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function deleteReminderPush(subscriptionId: number) {
  return request<void>(`/api/reminders/subscriptions/${subscriptionId}`, { method: "DELETE" });
}

export async function createBrowserPushSubscription() {
  if (!pushSupported()) throw new Error("当前浏览器不支持系统推送。");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知权限还没有开启。");
  const { public_key: publicKey } = await getReminderPublicKey();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("推送订阅信息不完整，请重新授权通知。");
  }
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

export async function unsubscribeBrowserPush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

export function reminderPayloadFromPreferences(preferences: UserPreferences, subscription: { endpoint: string; p256dh: string; auth: string }): ReminderSubscriptionPayload {
  return {
    ...subscription,
    enabled: preferences.reminder.enabled,
    reminder_time: preferences.reminder.time,
    timezone: TIME_ZONE,
    interview_goal: preferences.dailyGoals.interview,
    algorithm_goal: preferences.dailyGoals.algorithm,
    include_diary: preferences.dailyGoals.diary > 0,
    include_review: preferences.dailyGoals.review > 0,
  };
}

export function reminderSettingsFromPreferences(preferences: UserPreferences) {
  return {
    enabled: preferences.reminder.enabled,
    reminder_time: preferences.reminder.time,
    timezone: TIME_ZONE,
    interview_goal: preferences.dailyGoals.interview,
    algorithm_goal: preferences.dailyGoals.algorithm,
    include_diary: preferences.dailyGoals.diary > 0,
    include_review: preferences.dailyGoals.review > 0,
  };
}

function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}
