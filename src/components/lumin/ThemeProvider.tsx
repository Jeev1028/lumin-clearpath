import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  isThemeId,
  isThemeMode,
  MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemeId,
  type ThemeMode,
} from "@/lib/themes";

function readLocalTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function readLocalMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    return isThemeMode(raw) ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function persistLocalTheme(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore -- worst case it just doesn't persist across sessions
  }
}

function persistLocalMode(mode: ThemeMode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applyMode(mode: ThemeMode) {
  document.documentElement.setAttribute("data-mode", mode);
}

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Safe fallback so nothing crashes if ever rendered outside the provider
 * -- reads/writes just apply to <html> directly without persisting. */
const FALLBACK: ThemeContextValue = {
  theme: DEFAULT_THEME,
  setTheme: (theme) => applyTheme(theme),
  mode: DEFAULT_MODE,
  setMode: (mode) => applyMode(mode),
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}

/**
 * Applies the color theme and light/dark mode (data-theme / data-mode on
 * <html>, see styles.css) and persists both choices -- locally always, and
 * to the signed-in user's account metadata once known, mirroring
 * SoundSettingsProvider's pattern. The very first paint is handled by an
 * inline boot script in __root.tsx instead of this effect, so switching
 * themes/modes never causes a flash of the default before hydration.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  useEffect(() => {
    const localTheme = readLocalTheme();
    const localMode = readLocalMode();
    setThemeState(localTheme);
    setModeState(localMode);
    applyTheme(localTheme);
    applyMode(localMode);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fromMetaTheme = meta["theme"];
    if (isThemeId(fromMetaTheme) && fromMetaTheme !== readLocalTheme()) {
      setThemeState(fromMetaTheme);
      applyTheme(fromMetaTheme);
      persistLocalTheme(fromMetaTheme);
    }
    const fromMetaMode = meta["theme_mode"];
    if (isThemeMode(fromMetaMode) && fromMetaMode !== readLocalMode()) {
      setModeState(fromMetaMode);
      applyMode(fromMetaMode);
      persistLocalMode(fromMetaMode);
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

  function setMode(next: ThemeMode) {
    setModeState(next);
    applyMode(next);
    persistLocalMode(next);
    if (user) {
      void supabase.auth.updateUser({ data: { theme_mode: next } });
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
