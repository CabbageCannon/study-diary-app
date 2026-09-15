export type AppTheme = "mist" | "clay" | "night" | "frost";

/** colors 语义：[主背景 --canvas, accent-wash, accent] */
export const THEMES: { id: AppTheme; label: string; note: string; colors: string[] }[] = [
  { id: "mist", label: "雾松", note: "安静自然", colors: ["#f3f4f0", "#e3eee8", "#39755e"] },
  { id: "clay", label: "暖砂", note: "温暖橙调", colors: ["#f5e8da", "#f3dfcd", "#a85a32"] },
  { id: "night", label: "墨夜", note: "夜间阅读", colors: ["#1a201d", "#2d3d31", "#a9ca8b"] },
  { id: "frost", label: "霜夜", note: "冷调夜色", colors: ["#141a26", "#273143", "#8fb4f0"] },
];
