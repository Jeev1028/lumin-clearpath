import luminMark from "@/assets/lumin-mark.png";
import luminBookGlow from "@/assets/lumin-book-glow.png";
import { cn } from "@/lib/utils";

export function LuminMark({
  className,
  glow = true,
}: {
  className?: string;
  glow?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      {glow && (
        <span
          aria-hidden
          className="glow-orb animate-glow-pulse absolute inset-0 -z-10 scale-150 rounded-full"
        />
      )}
      <img
        src={luminMark}
        alt="Lumin AI logo"
        className="relative h-full w-full rounded-xl shadow-glow ring-1 ring-white/10"
        width={48}
        height={48}
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
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <span
        aria-hidden
        className="glow-orb animate-glow-pulse absolute inset-0 -z-10 scale-125 rounded-full"
      />
      <img
        src={luminBookGlow}
        alt="Lumin AI"
        className="relative h-full w-full object-contain drop-shadow-[0_0_20px_rgba(56,189,248,0.55)]"
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
