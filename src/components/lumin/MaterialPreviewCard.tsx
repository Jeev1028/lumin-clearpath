import { ClipboardList, FileText, Link2, Youtube } from "lucide-react";
import { useState } from "react";

import type { MaterialItem } from "@/lib/clearpath";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<NonNullable<MaterialItem["type"]>, typeof FileText> = {
  driveFile: FileText,
  link: Link2,
  youTubeVideo: Youtube,
  form: ClipboardList,
};

/** A Classroom-style attachment preview -- shows the real thumbnail Google
 * already returns for the material (no extra Drive scope needed), falling
 * back to a type icon if there's no thumbnail or it fails to load. */
export function MaterialPreviewCard({
  item,
  compact,
}: {
  item: MaterialItem;
  compact?: boolean;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const Icon = TYPE_ICON[item.type ?? "link"] ?? Link2;
  const showThumb = item.thumbnailUrl && !thumbFailed;

  const inner = (
    <>
      {showThumb ? (
        <img
          src={item.thumbnailUrl!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setThumbFailed(true)}
          className={cn(
            "shrink-0 rounded-md border border-border/60 object-cover",
            compact ? "h-9 w-9" : "h-11 w-11",
          )}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md bg-accent/10",
            compact ? "h-9 w-9" : "h-11 w-11",
          )}
        >
          <Icon className="h-4 w-4 text-accent" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
    </>
  );

  if (!item.url) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2 text-muted-foreground">
        {inner}
      </div>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2 transition-colors hover:border-accent/40"
    >
      {inner}
    </a>
  );
}
