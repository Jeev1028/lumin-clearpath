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
