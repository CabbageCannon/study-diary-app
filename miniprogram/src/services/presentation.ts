import Taro from "@tarojs/taro";

export const DAILY_QUESTION_COUNT = 3;

export function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function dateLabel(value: string) {
  const date = value.slice(0, 10).split("-");
  return date.length === 3 ? `${Number(date[1])}月${Number(date[2])}日` : value;
}
export function difficultyLabel(value?: string) {
  return ({ easy: "简单", medium: "中等", hard: "困难" } as Record<string, string>)[value?.toLowerCase() || ""] || value || "准备中";
}
export function goBack(fallback: string) {
  if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
  else void Taro.switchTab({ url: fallback });
}
