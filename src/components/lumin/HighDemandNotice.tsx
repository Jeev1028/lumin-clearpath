import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Shown while a one-shot AI tool (flashcards, knowledge map, practice, study
 * plan) is working. If it's still going after a few seconds, tell the student
 * why -- Lumin may be trying several models when demand is high.
 */
export function HighDemandNotice({
  active,
  className,
  delayMs = 5000,
}: {
  active: boolean;
  className?: string;
  delayMs?: number;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  if (!active || !slow) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      Lumin is in high demand right now, so this may take up to a minute. Please keep this page
      open.
    </p>
  );
}
