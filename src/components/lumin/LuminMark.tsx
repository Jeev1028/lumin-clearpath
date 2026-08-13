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
 * Deliberately does NOT add a drop-shadow glow here (an earlier version
 * did): drop-shadow traces the image's actual alpha shape, and the source
 * image's baked-in glow isn't a perfectly round circle -- it produced a
 * visible flat edge instead of a soft round one. The separate .glow-orb
 * background (a proper CSS radial-gradient circle, see below and
 * styles.css) already provides the theme-colored glow correctly.
 */
function useLuminMarkFilter(): string {
  const { theme, mode } = useTheme();
  const delta = THEME_LOGO_HUE_ROTATE[theme];
  if (mode === "light") return `invert(1) hue-rotate(${180 + delta}deg)`;
  return delta === 0 ? "none" : `hue-rotate(${delta}deg)`;
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
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
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
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
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
