import { useCallback, useEffect, useState } from "react";

export type OutrazoTheme = "dark" | "light";

const STORAGE_KEY = "outrazo-theme";

function applyTheme(theme: OutrazoTheme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
}

/** Dark-default theme state, persisted to localStorage and applied to <html>. */
export function useTheme() {
  const [theme, setThemeState] = useState<OutrazoTheme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as OutrazoTheme | null;
    const next: OutrazoTheme = stored === "light" ? "light" : "dark";
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setTheme = useCallback((next: OutrazoTheme) => {
    setThemeState(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: OutrazoTheme = current === "dark" ? "light" : "dark";
      applyTheme(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
