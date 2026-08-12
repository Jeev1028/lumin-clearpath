import { useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";

export type TextSize = "default" | "large" | "x-large";

export type AccessibilityPrefs = {
  textSize: TextSize;
  reducedMotion: boolean;
  highContrast: boolean;
  sidebarNav: boolean;
};

const STORAGE_KEY = "clearpath:accessibility-prefs";

export const DEFAULT_ACCESSIBILITY_PREFS: AccessibilityPrefs = {
  textSize: "default",
  reducedMotion: false,
  highContrast: false,
  sidebarNav: false,
};

function readLocalPrefs(): AccessibilityPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESSIBILITY_PREFS;
    return { ...DEFAULT_ACCESSIBILITY_PREFS, ...(JSON.parse(raw) as Partial<AccessibilityPrefs>) };
  } catch {
    return DEFAULT_ACCESSIBILITY_PREFS;
  }
}

function applyPrefs(prefs: AccessibilityPrefs) {
  const html = document.documentElement;
  html.setAttribute("data-text-size", prefs.textSize);
  html.setAttribute("data-reduced-motion", String(prefs.reducedMotion));
  html.setAttribute("data-high-contrast", String(prefs.highContrast));
  html.setAttribute("data-sidebar-nav", String(prefs.sidebarNav));
}

/** Applies accessibility preferences (text size, reduced motion, high
 * contrast, sidebar navigation) to <html> as data-* attributes, matched by
 * CSS in styles.css. Reads from the signed-in user's saved preference once
 * auth loads, and from localStorage before that / for signed-out visitors,
 * so the preference still applies on public pages like /auth. */
export function AccessibilityProvider() {
  const { user, loading } = useAuth();

  useEffect(() => {
    applyPrefs(readLocalPrefs());
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const prefs: AccessibilityPrefs = {
      textSize: (meta["a11y_text_size"] as TextSize) || DEFAULT_ACCESSIBILITY_PREFS.textSize,
      reducedMotion: Boolean(meta["a11y_reduced_motion"]),
      highContrast: Boolean(meta["a11y_high_contrast"]),
      sidebarNav: Boolean(meta["a11y_sidebar_nav"]),
    };
    applyPrefs(prefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore — worst case, prefs just don't persist across signed-out views
    }
  }, [loading, user]);

  return null;
}
