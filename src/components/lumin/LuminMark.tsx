import luminIcon from "@/assets/lumin-icon.png.asset.json";
import { cn } from "@/lib/utils";

export function LuminMark({ className }: { className?: string }) {
  return (
    <img
      src={luminIcon.url}
      alt="Lumin AI logo"
      className={cn("rounded-xl shadow-glow", className)}
      width={48}
      height={48}
    />
  );
}

export function LuminWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LuminMark className="h-9 w-9" />
      <div className="leading-none">
        <span className="font-display text-lg font-semibold tracking-tight">Lumin AI</span>
        <span className="ml-2 text-xs text-muted-foreground">by ClearPath</span>
      </div>
    </div>
  );
}