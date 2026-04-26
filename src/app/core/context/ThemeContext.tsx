import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

export type Theme = "day" | "night";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  isNight: boolean;
}

const STORAGE_KEY = "rafiq_theme_v1";
const DEFAULT_THEME: Theme = "night";

const Ctx = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggle: () => {},
  isNight: true,
});

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "day" || v === "night") return v;
  } catch (_) {}
  return DEFAULT_THEME;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState(t => (t === "day" ? "night" : "day")), []);

  const value = useMemo<ThemeCtx>(
    () => ({ theme, setTheme, toggle, isNight: theme === "night" }),
    [theme, setTheme, toggle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);
