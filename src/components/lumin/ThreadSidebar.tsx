import { Link } from "@tanstack/react-router";
import { MessageSquarePlus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchThreads, type Thread } from "@/lib/threads";

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
  /** The persistent desktop sidebar sits right below the site-wide
   * SiteHeader (which already shows the logo), so its own wordmark would
   * be redundant there. The mobile drawer, however, is a full-viewport
   * overlay that visually covers SiteHeader, so it still needs its own
   * branding. Defaults to shown. */
  showBranding?: boolean;
};

export function ThreadSidebar({
  threads,
  activeId,
  onNewThread,
  onDeleteThread,
  onSignOut,
  onNavigate,
  showBranding = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Thread[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchThreads(trimmed)
        .then((data) => setResults(data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const isSearchActive = query.trim().length > 0;
  const visibleThreads = isSearchActive ? (results ?? []) : threads;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border p-4">
        {showBranding && (
          <Link to="/" onClick={onNavigate} className="mb-4 inline-block">
            <LuminWordmark />
          </Link>
        )}
        <Button
          onClick={() => {
            onNewThread();
            onNavigate?.();
          }}
          className="w-full bg-gradient-lumin text-primary-foreground"
          size="sm"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New conversation
        </Button>

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="h-8 border-sidebar-border bg-sidebar-accent/40 pl-8 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {isSearchActive && searching && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Searching…</p>
        )}
        {isSearchActive && !searching && visibleThreads.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No conversations match &quot;{query.trim()}&quot;.
          </p>
        )}
        {visibleThreads.map((thread) => (
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
