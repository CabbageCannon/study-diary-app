import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type InterviewTheme = "editorial" | "quiet";

interface ThemeContextValue {
  theme: InterviewTheme;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "study-diary:theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): InterviewTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "quiet" ? "quiet" : "editorial";
  } catch {
    return "editorial";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<InterviewTheme>(readInitialTheme);

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
    toggleTheme: () => setTheme((current) => current === "editorial" ? "quiet" : "editorial"),
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
