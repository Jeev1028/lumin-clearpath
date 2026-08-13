export type ThemeId = "midnight" | "emerald" | "amethyst" | "sunset" | "rose";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  description: string;
  /** Matches the theme's actual --primary/--accent CSS variables (see
   * styles.css) -- used to render swatches in the picker UI without
   * needing to read computed styles. */
  primary: string;
  accent: string;
};

export const THEMES: ThemeDef[] = [
  {
    id: "midnight",
    label: "Midnight",
    description: "The original deep-blue look.",
    primary: "oklch(0.66 0.145 245)",
    accent: "oklch(0.78 0.12 205)",
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Cool green and teal.",
    primary: "oklch(0.66 0.145 155)",
    accent: "oklch(0.78 0.12 175)",
  },
  {
    id: "amethyst",
    label: "Amethyst",
    description: "Purple and magenta.",
    primary: "oklch(0.66 0.145 300)",
    accent: "oklch(0.78 0.12 325)",
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Warm amber and coral.",
    primary: "oklch(0.66 0.145 45)",
    accent: "oklch(0.78 0.12 25)",
  },
  {
    id: "rose",
    label: "Rose",
    description: "Red and pink.",
    primary: "oklch(0.66 0.145 15)",
    accent: "oklch(0.78 0.12 350)",
  },
];

export const DEFAULT_THEME: ThemeId = "midnight";
export const THEME_STORAGE_KEY = "clearpath:theme";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

/** Light/dark mode -- orthogonal to the color theme above. "dark" is the
 * original look (every color theme was designed dark-first). */
export type ThemeMode = "dark" | "light";

export const DEFAULT_MODE: ThemeMode = "dark";
export const MODE_STORAGE_KEY = "clearpath:theme-mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

/**
 * The Lumin mark is a raster image (a rendered blue glow, not drawn with
 * CSS), so it can't pick up the theme's oklch colors directly. Instead each
 * theme gets an approximate CSS hue-rotate() amount to shift the image's
 * baked-in blue toward that theme's accent color. This is a visual
 * approximation (hue-rotate operates on the image's actual pixels, not the
 * same color math as the oklch design tokens), tuned by eye rather than
 * computed exactly -- if a future logo redesign changes the source image's
 * base hue, these will need re-tuning too.
 */
export const THEME_LOGO_HUE_ROTATE: Record<ThemeId, number> = {
  midnight: 0,
  emerald: -60,
  amethyst: 70,
  sunset: 180,
  rose: 145,
};
