export type AppTheme = "mist" | "sea" | "tea" | "night";

/** colors 语义：[主背景 --canvas, accent-wash, accent] */
export const THEMES: { id: AppTheme; label: string; note: string; colors: string[] }[] = [
  { id: "mist", label: "雾松", note: "安静自然", colors: ["#f3f4f0", "#e3eee8", "#39755e"] },
  { id: "sea", label: "海盐", note: "清爽蓝灰", colors: ["#f2f5f5", "#e1ecef", "#527986"] },
  { id: "tea", label: "杏茶", note: "温暖纸感", colors: ["#f5f0e8", "#f1e1d2", "#9a6848"] },
  { id: "night", label: "墨夜", note: "夜间阅读", colors: ["#1a201d", "#2d3d31", "#a9ca8b"] },
];
