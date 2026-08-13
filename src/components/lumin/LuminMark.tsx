import luminBookGlow from "@/assets/lumin-book-glow.png";
import { useTheme } from "@/components/lumin/ThemeProvider";
import { THEME_LOGO_HUE_ROTATE } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * The mark is a raster image (a rendered blue glow, not drawn with CSS), so
 * it can't read the theme's oklch colors directly. This computes a CSS
 * hue-rotate() to shift it to roughly match the active color theme (see
 * THEME_LOGO_HUE_ROTATE), and flips it for light mode (invert + a
 * compensating hue-rotate, the standard trick for adapting a
 * light-lines-on-dark-glow image to a light background).
 *
 * The source image's own baked-in glow isn't a perfectly round circle --
 * it has a visible flat edge at the top instead of curving smoothly, which
 * regenerating the asset would be the real fix for, but that requires the
 * image-gen API (currently out of quota). A small blur softens that edge
 * into something that reads as an intentional soft glow instead of a
 * visible seam, in every mode/theme.
 */
function useLuminMarkFilter(): string {
  const { theme, mode } = useTheme();
  const delta = THEME_LOGO_HUE_ROTATE[theme];
  const softenEdge = "blur(1.5px)";
  if (mode === "light") return `invert(1) hue-rotate(${180 + delta}deg) ${softenEdge}`;
  return delta === 0 ? softenEdge : `hue-rotate(${delta}deg) ${softenEdge}`;
}

/**
 * An extra round, theme-colored glow layered *on top of* the image (screen
 * blend, so it only ever brightens, never darkens or tints the white
 * line-art) to further fill in that same flat top edge -- verified against
 * several alternatives (plain blur alone, blend modes, overlay behind
 * instead of in front) via rendered screenshots before picking this one.
 * Dark mode only: the same overlay against a light background washed out
 * and made the outline read as blurry rather than crisp, so light mode
 * relies on the blur above alone.
 */
function GlowFillOverlay() {
  const { mode } = useTheme();
  if (mode !== "dark") return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{
        background:
          "radial-gradient(circle, color-mix(in oklch, var(--primary) 90%, transparent) 0%, color-mix(in oklch, var(--primary) 50%, transparent) 35%, transparent 68%)",
        filter: "blur(10px)",
        mixBlendMode: "screen",
      }}
    />
  );
}

export function LuminMark({
  className,
  glow = true,
}: {
  className?: string;
  glow?: boolean;
}) {
  const filter = useLuminMarkFilter();
  return (
    <span
      className={cn(
        "relative isolate inline-flex shrink-0 items-center justify-center",
        className,
      )}
    >
      {glow && (
        <span
          aria-hidden
          className="glow-orb animate-glow-pulse absolute inset-0 -z-10 scale-150 rounded-full"
        />
      )}
      <img
        src={luminBookGlow}
        alt="Lumin AI logo"
        className="relative h-full w-full object-contain"
        style={{ filter }}
      />
      {glow && <GlowFillOverlay />}
    </span>
  );
}

/**
 * Cropped, background-removed version of the mark — just the glowing book,
 * no baked-in wordmark. Meant for contexts (like the top nav) where the
 * "Lumin AI" text is already set separately right next to it, so the icon
 * itself can run bigger without duplicating the name.
 */
export function LuminBookMark({ className }: { className?: string }) {
  const filter = useLuminMarkFilter();
  return (
    <span
      className={cn(
        "relative isolate inline-flex shrink-0 items-center justify-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="glow-orb animate-glow-pulse absolute inset-0 -z-10 scale-125 rounded-full"
      />
      <img
        src={luminBookGlow}
        alt="Lumin AI"
        className="relative h-full w-full object-contain"
        style={{ filter }}
      />
      <GlowFillOverlay />
    </span>
  );
}

export function LuminWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LuminBookMark className="h-14 w-14 sm:h-16 sm:w-16" />
      <div className="leading-none">
        <span className="font-display text-lg font-semibold tracking-tight">Lumin AI</span>
        <span className="ml-2 text-xs text-muted-foreground">by ClearPath</span>
      </div>
    </div>
  );
}
