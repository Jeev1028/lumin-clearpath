import { Link } from "@tanstack/react-router";
import { MessageSquarePlus, Trash2 } from "lucide-react";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Thread } from "@/lib/threads";

type Props = {
  threads: Thread[];
  activeId: string;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  onSignOut: () => void;
  /** Called after any navigation-triggering action — used to close the
   * mobile drawer this sidebar may be rendered inside of. No-op on the
   * persistent desktop sidebar. */
  onNavigate?: () => void;
};

export function ThreadSidebar({
  threads,
  activeId,
  onNewThread,
  onDeleteThread,
  onSignOut,
  onNavigate,
}: Props) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border p-4">
        <Link to="/" onClick={onNavigate}>
          <LuminWordmark />
        </Link>
        <Button
          onClick={() => {
            onNewThread();
            onNavigate?.();
          }}
          className="mt-4 w-full bg-gradient-lumin text-primary-foreground"
          size="sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-1 transition-colors",
              thread.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            )}
          >
            <Link
              to="/chat/$threadId"
              params={{ threadId: thread.id }}
              onClick={onNavigate}
              className="flex-1 truncate px-2 py-2 text-sm text-sidebar-foreground"
            >
              {thread.title}
            </Link>
            <button
              type="button"
              aria-label="Delete conversation"
              onClick={() => onDeleteThread(thread.id)}
              className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </aside>
  );
}
