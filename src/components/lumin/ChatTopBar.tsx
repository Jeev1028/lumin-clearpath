import { Link } from "@tanstack/react-router";
import { Menu, MessageSquarePlus } from "lucide-react";

import { AccountMenu } from "@/components/lumin/AccountMenu";
import { LuminWordmark } from "@/components/lumin/LuminMark";
import { ReminderBell } from "@/components/lumin/ReminderBell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const links = [
  { to: "/tasks", label: "Tasks" },
  { to: "/schedule", label: "Schedule" },
  { to: "/classroom", label: "Classroom" },
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
    <header className="flex shrink-0 border-b border-border/50">
      <div className="hidden w-72 shrink-0 items-center border-r border-sidebar-border bg-sidebar px-4 py-4 md:flex">
        <Link to="/" className="transition-transform duration-200 hover:scale-[1.02]">
          <LuminWordmark />
        </Link>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-between gap-3 bg-background/70 px-4 py-4 backdrop-blur-md md:justify-end md:px-6">
        <div className="flex items-center gap-2 md:hidden">
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

        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1">
            {links.map((link) => (
              <Button key={link.to} asChild variant="ghost" size="sm" className="rounded-full">
                <Link to={link.to} activeProps={{ className: "!bg-secondary/70 text-foreground" }}>
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>
          {session && <ReminderBell />}
          {session && <AccountMenu />}
          <button
            type="button"
            onClick={onNewThread}
            aria-label="New conversation"
            className="rounded-lg p-2 text-foreground hover:bg-secondary/60 md:hidden"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
