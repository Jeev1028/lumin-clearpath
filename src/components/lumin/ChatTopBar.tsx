import { Link } from "@tanstack/react-router";
import { Menu, MessageSquarePlus } from "lucide-react";

import { AccountMenu } from "@/components/lumin/AccountMenu";
import { LuminWordmark } from "@/components/lumin/LuminMark";
import { ReminderBell } from "@/components/lumin/ReminderBell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

// Kept in sync with SiteHeader's link list -- this used to only have 4 of
// the 8 links (missing Today/Calendar/Knowledge/Flashcards), which made it
// look like navigation was broken/limited specifically on the chat page.
const links = [
  { to: "/home", label: "Today" },
  { to: "/tasks", label: "Tasks" },
  { to: "/calendar", label: "Calendar" },
  { to: "/schedule", label: "Schedule" },
  { to: "/classroom", label: "Classroom" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/chat", label: "Lumin AI" },
] as const;

/**
 * Chat-page-only top bar. Unlike the generic SiteHeader, the logo sits in
 * its own cap styled like the conversation sidebar (same width and
 * background, sharing its right border) so it reads as part of the
 * sidebar rather than the generic site header — the rest of the bar
 * (nav + account) keeps the normal header treatment.
 */
export function ChatTopBar({
  onOpenSidebar,
  onNewThread,
}: {
  onOpenSidebar: () => void;
  onNewThread: () => void;
}) {
  const { session } = useAuth();

  return (
    <header className="safe-top flex shrink-0 border-b border-border/50 bg-background/70">
      <div className="hidden w-72 shrink-0 items-center border-r border-sidebar-border bg-sidebar px-4 py-4 md:flex">
        <Link to="/" className="transition-transform duration-200 hover:scale-[1.02]">
          <LuminWordmark />
        </Link>
      </div>

      {/* min-w-0 here is load-bearing: without it, this flex-1 item's
          automatic minimum width is based on its un-shrunk children (the
          8-link nav below), which pushes the whole header wider than the
          screen instead of letting the nav scroll internally -- the exact
          bug that made the nav look like only 3-4 links existed on
          mobile even after they were all added back. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 bg-background/70 px-4 py-3 backdrop-blur-md md:flex-row md:items-center md:justify-end md:gap-4 md:px-6 md:py-4">
        {/* Mobile-only row: hamburger + wordmark + the icon cluster. The
            nav gets its own full-width row below (like SiteHeader's
            site-header-nav row) instead of squeezing into this same row,
            which used to leave only 3-4 of the 8 links visible/reachable
            on phones and tablets. */}
        <div className="flex items-center justify-between gap-3 md:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open conversation menu"
              className="rounded-lg p-2 text-foreground hover:bg-secondary/60"
            >
              <Menu className="h-5 w-5" />
            </button>
            <LuminWordmark className="scale-90" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {session && <ReminderBell />}
            {session && <AccountMenu />}
            <button
              type="button"
              onClick={onNewThread}
              aria-label="New conversation"
              className="rounded-lg p-2 text-foreground hover:bg-secondary/60"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Horizontally scrollable on any screen too narrow to fit every
            link (scroll-x-contain: overflow-x auto, hidden scrollbar) --
            on desktop this is wide enough that nothing scrolls. */}
        <nav className="scroll-x-contain flex min-w-0 items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1">
          {links.map((link) => (
            <Button
              key={link.to}
              asChild
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full"
            >
              <Link to={link.to} activeProps={{ className: "!bg-secondary/70 text-foreground" }}>
                {link.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          {session && <ReminderBell />}
          {session && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}
