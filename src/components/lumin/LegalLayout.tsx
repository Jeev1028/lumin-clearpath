import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LuminWordmark } from "@/components/lumin/LuminMark";

export function LegalLayout({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-deep">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="glow-orb absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 opacity-40" />
      </div>

      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <Link to="/" className="inline-block transition-transform duration-200 hover:scale-[1.02]">
          <LuminWordmark />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-border/70 bg-card/70 p-8 shadow-panel backdrop-blur-sm sm:p-12">
          <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
          <div className="lumin-md mt-8 text-sm leading-relaxed text-foreground/90 sm:text-base">
            {children}
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        ClearPath · Lumin AI · To illuminate your educational journey
      </footer>
    </div>
  );
}
