import { createFileRoute, Link } from "@tanstack/react-router";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — ClearPath" },
      {
        name: "description",
        content: "Meet the grade 10 student behind ClearPath and Lumin AI.",
      },
      { property: "og:title", content: "About — ClearPath" },
      {
        property: "og:description",
        content: "Meet the grade 10 student behind ClearPath and Lumin AI.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-deep">
      {/* Layered ambient background: a faint starfield for texture, a
          vignette to keep the edges of the screen darker/calmer than the
          center, and three glow orbs (one sitting right behind the quote
          as a soft spotlight, two more framing the corners) with staggered
          pulse timing so they don't all breathe in sync. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="bg-starfield absolute inset-0 opacity-[0.15]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 30% 40%, transparent 0%, color-mix(in oklch, var(--background) 55%, transparent) 100%)",
          }}
        />
        <div className="glow-orb animate-glow-pulse absolute top-1/3 -left-16 h-[38rem] w-[38rem] -translate-y-1/2 opacity-70" />
        <div
          className="glow-orb animate-glow-pulse absolute -top-32 right-0 h-[26rem] w-[26rem] opacity-30"
          style={{ animationDelay: "1.2s" }}
        />
        <div
          className="glow-orb animate-glow-pulse absolute -right-24 -bottom-24 h-[30rem] w-[30rem] opacity-30"
          style={{ animationDelay: "2.1s" }}
        />
      </div>

      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-6 py-6">
        <Link to="/" className="inline-block transition-transform duration-200 hover:scale-[1.02]">
          <LuminWordmark />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link to="/about" className="text-foreground">
            About
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </header>

      {/* The quote is the page's main event: large, glowing, pinned to the
          left. The rest of the write-up sits in its own scrollable panel
          to its right so it doesn't compete for attention or force the
          quote to shrink to make room. */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="text-glow-accent font-display text-4xl leading-[1.15] font-semibold text-accent sm:text-5xl lg:text-6xl">
              &ldquo;The path worth taking is rarely the easiest&rdquo;
            </p>
            <p className="mt-6 text-sm font-medium tracking-wide text-muted-foreground uppercase sm:text-base">
              — Jeevin Birdi, Grade 10 Student, Founder of Lumin AI and Lumin ClearPath
            </p>
          </div>

          {/* ScrollArea (Radix, see components/ui/scroll-area.tsx) instead
              of a plain overflow-y-auto div -- gives this its own thin,
              theme-colored thumb instead of the browser's default (often
              stark white/gray) scrollbar. */}
          <ScrollArea className="max-h-[65vh] rounded-3xl border border-border/70 bg-card/70 shadow-panel backdrop-blur-sm">
            <div className="lumin-md p-6 text-sm leading-relaxed text-foreground/90 sm:p-8 sm:text-base">
              <p>
                ClearPath is a passion project: a study platform built by a grade 10 student,
                including Lumin AI, its study companion.
              </p>

              <blockquote className="border-l-2 border-accent/50 pl-4 text-foreground/90 italic">
                I built ClearPath because I was tired of juggling five different apps just to keep
                track of my own schoolwork, and every AI tool I tried either refused to help or just
                did the assignment for me. I wanted something in between: a tutor that actually
                teaches you, instead of one that either shuts you out or does your thinking for you.
                It's still very much a work in progress, built and maintained in spare time, but I'm
                proud of it, and I'm glad you're here.
              </blockquote>

              <h2 className="text-xl font-semibold">What ClearPath is</h2>
              <p>
                ClearPath is a calm study platform: a place to track tests and assignments, lay out
                a class schedule, and work with Lumin AI, a study companion that actually behaves
                like a tutor rather than a ghostwriter.
              </p>

              <h2 className="text-xl font-semibold">What Lumin AI actually does</h2>
              <p>
                Lumin AI explains concepts, asks guiding questions, points you to real sources, and
                gives feedback on work you've already done, all without writing it for you. It won't
                produce an essay, a lab report, or a ready-to-submit outline, and it won't hand you
                a finished answer to a math problem or a name for your school project. Instead, it
                walks you through the method or the way to think about it, so the thinking stays
                yours. You can read the full detail of how it's expected to behave in our{" "}
                <Link to="/terms" className="underline underline-offset-4">
                  Terms of Service
                </Link>
                .
              </p>

              <h2 className="text-xl font-semibold">Get in touch</h2>
              <p>
                If you have feedback, a bug to report, or just want to say hello, reach out at{" "}
                <a href="mailto:lumin-support@luminclearpath.ca">lumin-support@luminclearpath.ca</a>
                . You can also find the project on{" "}
                <a
                  href="https://github.com/Jeev1028/lumin-clearpath"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  GitHub
                </a>
                .
              </p>

              <p>
                See also our{" "}
                <Link to="/terms" className="underline underline-offset-4">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline underline-offset-4">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </ScrollArea>
        </div>
      </main>

      <footer className="shrink-0 border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        ClearPath · Lumin AI · To illuminate your educational journey
      </footer>
    </div>
  );
}
