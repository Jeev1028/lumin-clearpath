import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/lumin/AccountMenu";
import { LuminWordmark } from "@/components/lumin/LuminMark";
import { ReminderBell } from "@/components/lumin/ReminderBell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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

export function SiteHeader({
  leading,
  trailing,
}: { leading?: ReactNode; trailing?: ReactNode } = {}) {
  const { session } = useAuth();

  return (
    <header className="safe-top sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 shrink items-center gap-2">
            {leading}
            <Link
              to={session ? "/home" : "/"}
              className="min-w-0 transition-transform duration-200 hover:scale-[1.02]"
            >
              <LuminWordmark />
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {session && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open quick search (Ctrl+K)"
                title="Quick search (Ctrl+K)"
                className="rounded-full border border-border/70 bg-card/40 text-muted-foreground hover:text-foreground"
                onClick={() => window.dispatchEvent(new Event("clearpath:open-command-palette"))}
              >
                <Search className="h-4 w-4" aria-hidden />
              </Button>
            )}
            {session && <ReminderBell />}
            {session && <AccountMenu />}
            {!session && (
              <Button
                asChild
                size="sm"
                className="rounded-full bg-gradient-lumin px-4 text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-105"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
            {trailing}
          </div>
        </div>

        {/* Its own full-width row so the nav strip always has real room to
            work with (rather than being squeezed to a sliver next to the
            logo/account icons) -- on narrow phones this scrolls
            horizontally within itself; on desktop it's wide enough that
            every link just fits with no scrolling needed. */}
        <nav className="scroll-x-contain mt-3 flex items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1">
          {links.map((link) => (
            <Button key={link.to} asChild variant="ghost" size="sm" className="shrink-0 rounded-full">
              <Link to={link.to} activeProps={{ className: "!bg-secondary/70 text-foreground" }}>
                {link.label}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
