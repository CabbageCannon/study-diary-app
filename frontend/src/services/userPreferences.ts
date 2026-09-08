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
const REVIEW_BASELINE_KEY = "study-diary:review-baseline";
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
  "今天只要开始，后半段就会慢慢跟上。",
  "把模糊的地方说出口，它就清楚了一半。",
  "不追求漂亮答案，先留下真实思路。",
  "今天走得短一点，也仍然算向前。",
  "会做是一瞬间，会讲才算真正留下。",
  "先捡最小的一题，让状态自己回来。",
  "答案可以晚一点，思考先发生就好。",
  "把难题拆小，今天只负责第一块。",
  "记住一个为什么，胜过背下十个结论。",
  "慢慢积累，也是一种速度。",
  "把今天写好，就够了。",
  "今天只完成今天。",
  "先把思路铺开，再让细节各自归位。",
  "卡住的地方，正好值得记一笔。",
  "不用把整座山搬走，先挪一块石头。",
  "今天多说清一个概念，就多一分底气。",
  "复盘不是重来，是让下一次更轻。",
  "给知识一个位置，它才不会匆匆路过。",
  "一道旧题，也能照见新的盲点。",
  "先完成，再慢慢把它变得更好。",
  "思路不必一次成形，先让它有形。",
  "把复杂的话说简单，是今天的小胜利。",
  "不必状态满格，也可以完成一格。",
  "今天的耐心，也会成为明天的熟练。",
  "先问自己为什么，再去记住是什么。",
  "每一次回忆，都在给记忆加一层路标。",
  "错题没有追你，它只是在等你回头看。",
  "今天留一点痕迹，时间会把它连成线。",
  "一个清楚的例子，能救活一段抽象定义。",
  "先讲给自己听，再讲给面试官听。",
  "没有白想的题，只有没写下的收获。",
  "把犹豫变成一句话，答案就开始了。",
  "今天不赶路，只把脚下这一段走稳。",
  "真正的熟悉，是换种问法也能回答。",
  "允许思路绕一点，最后记得回到主线。",
  "先抓住边界，再处理漂亮的细节。",
  "把一个知识点讲短，往往需要想得更深。",
  "今天的三分钟，也能给明天省十分钟。",
  "先找不变量，再看变化从哪里发生。",
  "别让标准答案替你跳过思考。",
  "学习不是囤积，是一次次重新取用。",
  "今天懂得慢一点，之后会想得快一点。",
  "给答案留一点呼吸，逻辑会更清楚。",
  "写下过程，结果才不只是一次运气。",
  "把问题换个角度，旧知识也会长出新枝。",
  "真正可靠的答案，经得起一句追问。",
  "今天留一点余地，明天才有继续的力气。",
  "先把主干说稳，枝叶随后再补。",
  "每次讲错一点，下一次就少错一点。",
  "把学会的东西用一次，它才开始属于你。",
  "今天的进步，可以安静得只有自己知道。",
  "先做一道会开始的题，再碰那道最难的。",
];

const reminderOpeners = [
  "今晚还差一点收尾",
  "学习日记来敲门",
  "今天的知识还没完全落袋",
  "给未来的你递个小纸条",
  "先补一小块，今天就不散场",
  "你的复习雷达响了一下",
  "今晚给今天补一个小句号",
  "还有几格进度等你收下",
  "今天的小任务来报到",
  "睡前再替未来的你做一点",
  "知识口袋里还有一点空位",
  "趁今天还没翻页，补上一笔",
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
  const [year, month, day] = getShanghaiDateKey(date).split("-").map(Number);
  const index = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000) % dailySentences.length;
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
  const reviewStatsReady = data.algorithmStats !== null || data.interviewStats !== null;
  const review = reviewStatsReady
    ? reviewProgress(dueCount, preferences.dailyGoals.review)
    : { completed: 0, target: preferences.dailyGoals.review };
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
      completed: review.completed,
      target: review.target,
      href: "/algorithms/review",
    },
  ];
}

function reviewProgress(dueCount: number, configuredGoal: number) {
  if (configuredGoal <= 0) return { completed: 0, target: 0 };
  const dateKey = getShanghaiDateKey();
  let target = Math.max(dueCount, configuredGoal);
  try {
    const saved = JSON.parse(window.localStorage.getItem(REVIEW_BASELINE_KEY) ?? "null") as { dateKey?: string; target?: number } | null;
    if (saved?.dateKey === dateKey && Number.isFinite(saved.target)) target = Math.max(configuredGoal, saved.target ?? 0);
    else window.localStorage.setItem(REVIEW_BASELINE_KEY, JSON.stringify({ dateKey, target }));
  } catch {
    // Private browsing may disable storage; current due count remains useful.
  }
  return { completed: Math.max(0, target - dueCount), target };
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
