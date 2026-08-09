import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, Compass, Link2, ShieldCheck } from "lucide-react";

import { LuminMark, LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumin AI — Illuminate your educational journey" },
      {
        name: "description",
        content:
          "Lumin AI is the ClearPath study companion: research, sources and paragraph summaries that guide students instead of doing their work.",
      },
      { property: "og:title", content: "Lumin AI — Illuminate your educational journey" },
      {
        property: "og:description",
        content: "The academically honest AI study guide from ClearPath.",
      },
    ],
  }),
  component: Index,
});

const principles = [
  {
    icon: Compass,
    title: "Guides, never ghostwrites",
    body: "Lumin walks beside you through a problem with questions, explanations and checks for understanding. It will not write an assignment for you — and it says so plainly when asked.",
  },
  {
    icon: Link2,
    title: "Sources, not citations",
    body: "Research requests come back with real links to what was read. Lumin reminds you to cite in MLA format, and deliberately leaves the citation itself for you to write.",
  },
  {
    icon: BookOpenCheck,
    title: "Paragraph-form summaries only",
    body: "Analysis and summarization arrive as plain paragraphs. Never a lab report, never an essay, never a research paper skeleton dressed up as help.",
  },
  {
    icon: ShieldCheck,
    title: "Work-around aware",
    body: "\"Summarize photosynthesis into a lab report\" is still an assignment. Lumin recognises indirect requests across a whole conversation and holds the line every time.",
  },
];

function Index() {
  const { session, loading } = useAuth();

  return (
    <div className="min-h-screen bg-deep">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <LuminWordmark />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="#principles">Principles</a>
          </Button>
          <Button asChild size="sm" className="bg-gradient-lumin text-primary-foreground">
            <Link to={session ? "/chat" : "/auth"}>{loading ? "Open Lumin" : session ? "Open Lumin" : "Sign in"}</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
          <LuminMark className="mx-auto mb-8 h-20 w-20" />
          <p className="mb-4 inline-flex items-center rounded-full border border-border/70 bg-card/60 px-4 py-1.5 text-xs tracking-widest text-muted-foreground uppercase">
            ClearPath · Study companion
          </p>
          <h1 className="text-balance text-5xl font-bold sm:text-6xl">
            il<span className="text-gradient-lumin">LUMIN</span>ate your
            <br className="hidden sm:block" /> educational journey
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Lumin AI is a tutor, a researcher and a reading partner — held to strict academic
            honesty. It illuminates the path. You still walk it.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-lumin px-8 text-primary-foreground shadow-glow">
              <Link to={session ? "/chat" : "/auth"}>Start a conversation</Link>
            </Button>
          </div>
        </section>

        <section id="principles" className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-10 text-center text-2xl font-semibold">
            How Lumin keeps you honest
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {principles.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
              >
                <item.icon className="mb-4 h-6 w-6 text-accent" aria-hidden />
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="rounded-3xl border border-border/70 bg-card/60 p-10 text-center shadow-panel">
            <h2 className="text-2xl font-semibold">Part of ClearPath</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              ClearPath is the educational platform Lumin AI was built for — a calmer place for
              students to research, study and understand. Lumin is its front door.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <a href="https://www.luminclearpath.ca" target="_blank" rel="noreferrer">
                Visit luminclearpath.ca
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Lumin AI · To illuminate your educational journey
      </footer>
    </div>
  );
}
