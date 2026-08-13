import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME, isThemeId, THEME_STORAGE_KEY, type ThemeId } from "@/lib/themes";

function readLocalTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function persistLocalTheme(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore -- worst case it just doesn't persist across sessions
  }
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Safe fallback so nothing crashes if ever rendered outside the provider
 * -- reads/writes just apply to <html> directly without persisting. */
const FALLBACK: ThemeContextValue = {
  theme: DEFAULT_THEME,
  setTheme: (theme) => applyTheme(theme),
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}

/**
 * Applies the color theme (data-theme on <html>, see the theme blocks in
 * styles.css) and persists the choice -- locally always, and to the
 * signed-in user's account metadata once known, mirroring
 * SoundSettingsProvider's pattern. The very first paint is handled by an
 * inline boot script in __root.tsx instead of this effect, so switching
 * themes never causes a flash of the default theme before hydration.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const local = readLocalTheme();
    setThemeState(local);
    applyTheme(local);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fromMeta = meta["theme"];
    if (isThemeId(fromMeta) && fromMeta !== readLocalTheme()) {
      setThemeState(fromMeta);
      applyTheme(fromMeta);
      persistLocalTheme(fromMeta);
    }
  }, [loading, user]);

  function setTheme(next: ThemeId) {
    setThemeState(next);
    applyTheme(next);
    persistLocalTheme(next);
    if (user) {
      void supabase.auth.updateUser({ data: { theme: next } });
    }
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
