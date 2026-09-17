import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ds-theme";

/** The saved choice, else the device's preference, else the light studio —
 *  which is the design as drawn. Guarded because localStorage throws in a
 *  private window on some browsers. */
function initialTheme(key = STORAGE_KEY, fallback?: Theme): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* no storage — fall through */ }
  if (fallback) return fallback;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

/** Stamps the theme on <html> before the first paint that can see it. Every
 *  themed stylesheet keys off `html[data-theme]`, so this is the one place the
 *  choice lives; screens only read it. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** For screens that show the theme but do not own the toggle: make sure the
 *  saved choice is on <html> — a reload that lands on /schedule would
 *  otherwise render before any toggle has run. */
export function ensureTheme() {
  if (!document.documentElement.dataset.theme) applyTheme(initialTheme());
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useLayoutEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme(t => (t === "light" ? "dark" : "light")), []);
  return [theme, toggle];
}

/**
 * A screen with its own palette, remembered separately from the app's. The
 * live game screen uses this: it opens dark whatever Home is set to (a press
 * box at 8pm is dark, and a white screen there is a floodlight in your
 * face), with its own toggle for a day game. On unmount the app's theme is
 * put back so the next screen paints correctly.
 */
export function useScreenTheme(key: string, fallback: Theme): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => initialTheme(key, fallback));
  /* Layout effect: the palette has to be on <html> before the first paint or
     a dark screen flashes white on the way in. */
  useLayoutEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(key, theme); } catch { /* ignore */ }
  }, [key, theme]);
  useEffect(() => () => { applyTheme(initialTheme()); }, []);
  const toggle = useCallback(() => setTheme(t => (t === "light" ? "dark" : "light")), []);
  return [theme, toggle];
}
