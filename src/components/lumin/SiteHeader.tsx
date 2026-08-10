import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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

export function SiteHeader({
  leading,
  trailing,
}: { leading?: ReactNode; trailing?: ReactNode } = {}) {
  const { session } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-2">
          {leading}
          <Link to="/" className="transition-transform duration-200 hover:scale-[1.02]">
            <LuminWordmark />
          </Link>
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
            {!session && (
              <Button
                asChild
                size="sm"
                className="rounded-full bg-gradient-lumin px-4 text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-105"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
          {session && <ReminderBell />}
          {session && <AccountMenu />}
          {trailing}
        </div>
      </div>
    </header>
  );
}
