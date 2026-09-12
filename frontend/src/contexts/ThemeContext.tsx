import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppTheme = "mist" | "sea" | "tea" | "night";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
