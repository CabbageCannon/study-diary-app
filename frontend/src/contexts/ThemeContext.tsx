import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { THEMES, type AppTheme } from "./themes";

export type { AppTheme };

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  cycleTheme: () => void;
}

const THEME_STORAGE_KEY = "study-diary:theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): AppTheme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "sea" || saved === "tea" || saved === "night" || saved === "mist") return saved;
    return saved === "quiet" ? "night" : "mist";
  } catch {
    return "mist";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(readInitialTheme);

  // useLayoutEffect（而非 useEffect）：波纹过渡要求 data-theme 在 flushSync 期间同步落到 DOM 上。
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES.find((item) => item.id === theme)?.colors[0] ?? "#eef1ed");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme remains active for the current session if storage is unavailable.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === "night" ? "mist" : "night"),
    cycleTheme: () => setTheme((current) => THEMES[(THEMES.findIndex((item) => item.id === current) + 1) % THEMES.length].id),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 中使用");
  }
  return context;
}
