import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ds-theme";

/** The saved choice, else the device's preference, else the light studio —
 *  which is the design as drawn. Guarded because localStorage throws in a
 *  private window on some browsers. */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* no storage — fall through */ }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

/** Stamps the theme on <html> before the first paint that can see it. Every
 *  themed stylesheet keys off `html[data-theme]`, so this is the one place the
 *  choice lives; screens only read it. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggle = useCallback(() => setTheme(t => (t === "light" ? "dark" : "light")), []);
  return [theme, toggle];
}
