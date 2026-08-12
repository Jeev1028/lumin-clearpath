import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardList,
  Compass,
  Github,
  Link2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { LuminMark } from "@/components/lumin/LuminMark";
import { FloatingChatButton } from "@/components/lumin/FloatingChatButton";
import { SiteChatWidget } from "@/components/lumin/SiteChatWidget";
import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import showcaseLuminChat from "@/assets/showcase-lumin-chat.png";
import showcaseTasks from "@/assets/showcase-tasks.png";
import showcaseSchedule from "@/assets/showcase-schedule.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClearPath — Illuminate your educational journey" },
      {
        name: "description",
        content:
          "ClearPath is a calm study platform: track tests and assignments, plan your class schedule, and study with Lumin AI — the tutor that guides instead of ghostwriting.",
      },
      { property: "og:title", content: "ClearPath — Illuminate your educational journey" },
      {
        property: "og:description",
        content: "Tasks, class schedule and an academically honest AI study guide, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const platform = [
  {
    icon: ClipboardList,
    title: "Tasks",
    body: "Tests, assignments, projects and readings in one list, with due dates and hand-in status so nothing slips.",
    to: "/tasks" as const,
    cta: "Open tasks",
  },
  {
    icon: CalendarDays,
    title: "Class schedule",
    body: "Weekday classes, weekend sessions, extracurriculars and holiday learning, laid out across your week.",
    to: "/schedule" as const,
    cta: "Open schedule",
  },
  {
    icon: Sparkles,
    title: "Lumin AI",
    body: "A study companion that researches, explains and summarises — and refuses to write your work for you.",
    to: "/chat" as const,
    cta: "Start a conversation",
  },
];

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
    body: '"Summarize photosynthesis into a lab report" is still an assignment. Lumin recognises indirect requests across a whole conversation and holds the line every time.',
  },
];

const showcase = [
  {
    image: showcaseLuminChat,
    alt: "Lumin AI answering a research question with sources and no over-explaining",
    title: "Lumin AI, mid-conversation",
    body: "A real research request, answered with sources and a few angles to explore — not a finished answer handed over.",
  },
  {
    image: showcaseTasks,
    alt: "The ClearPath tasks page showing tests and assignments with due dates",
    title: "Every task, one list",
    body: "Tests, assignments, and projects with due dates and status, replacing scattered reminders across apps.",
  },
  {
    image: showcaseSchedule,
    alt: "The ClearPath class schedule laid out across the week",
    title: "Your whole week, laid out",
    body: "Weekday classes, extracurriculars, and weekend sessions in one view, so nothing gets missed.",
  },
];

const capabilities = [
  "Tracks every test, assignment and project with due dates and submission status",
  "Lays out your entire week — classes, extracurriculars, weekend and holiday sessions",
  "An AI tutor that explains and researches, cites sources, and never writes your work for you",
  "Google Sign-In with your own account — no separate password to manage",
  "A public assistant right on this page that answers questions before you even sign up",
  "Built to hold up under real, whole-school daily use — not a one-person demo",
];

function Index() {
  const { session, loading } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-deep">
      {/* Ambient background glow orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="glow-orb absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 opacity-70" />
        <div className="glow-orb absolute top-[28rem] -left-32 h-96 w-96 opacity-40" />
        <div className="glow-orb absolute top-[52rem] -right-24 h-[28rem] w-[28rem] opacity-40" />
      </div>

      <SiteHeader />

      <main id="main-content">
        <section className="mx-auto max-w-3xl px-6 pt-20 pb-24 text-center">
          <LuminMark className="animate-float mx-auto mb-8 h-24 w-24 sm:h-28 sm:w-28" />
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-4 py-1.5 text-xs tracking-widest text-muted-foreground uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            ClearPath · Your platform for academic excellence
          </p>
          <h1 className="text-balance text-5xl leading-[1.2] font-bold sm:text-7xl italic">
            "il<span className="text-gradient-lumin pr-[0.1em] -mr-[0.1em]">LUMIN</span>ate your
            <br /> educational journey"
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            ClearPath brings your tasks, your class schedule and Lumin AI together in one calm
            place. It illuminates the path. You still walk it.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-gradient-lumin px-8 text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-105"
            >
              <Link to={session ? "/home" : "/auth"}>
                {loading ? "Enter ClearPath" : session ? "Enter ClearPath" : "Get started"}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-border/70 bg-card/40 px-8 text-foreground backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:border-accent/60 hover:bg-card/70 hover:text-foreground"
            >
              <Link to={session ? "/chat" : "/auth"}>Ask Lumin AI</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">Why would I want to use this?</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Because juggling Google Classroom, ManageBac, and a dozen reminders shouldn&apos;t be
              the hardest part of school. These are real screenshots of the actual product — not a
              mockup.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {showcase.map((item) => (
              <figure
                key={item.title}
                className="group overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-panel transition-all duration-300 hover:-translate-y-1.5 hover:border-accent/50 hover:shadow-glow"
              >
                <img
                  src={item.image}
                  alt={item.alt}
                  className="w-full border-b border-border/60"
                  loading="lazy"
                />
                <figcaption className="p-5">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mx-auto mt-16 max-w-3xl text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">What is it truly capable of?</h2>
            <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
              {capabilities.map((capability) => (
                <div
                  key={capability}
                  className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {capability}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-10 text-center text-2xl font-semibold sm:text-3xl">
            Everything in one place
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {platform.map((item) => (
              <article
                key={item.title}
                className={cn(
                  "group flex flex-col rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel",
                  "transition-all duration-300 hover:-translate-y-1.5 hover:border-accent/50 hover:shadow-glow",
                )}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 transition-colors duration-300 group-hover:bg-accent/20">
                  <item.icon className="h-5 w-5 text-accent" aria-hidden />
                </div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="mt-4 self-start px-0 text-accent hover:bg-transparent hover:text-accent"
                >
                  <Link to={session ? item.to : "/auth"} className="inline-flex items-center gap-1">
                    {item.cta}
                    <span className="transition-transform duration-200 group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-10 shadow-panel">
            <div
              className="glow-orb pointer-events-none absolute -top-24 right-0 h-64 w-64 opacity-30"
              aria-hidden
            />
            <h2 className="text-center text-2xl font-semibold sm:text-3xl">
              Assignments made easy
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
              ClearPath streamlines how work is tracked and handed in, so organisation stops
              competing with learning.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BookOpenCheck, title: "Tests", body: "Assessment tracking" },
                { icon: ClipboardList, title: "Assignments", body: "Project work" },
                { icon: TrendingUp, title: "Progress", body: "Performance monitoring" },
                { icon: CalendarDays, title: "Submissions", body: "Efficient hand-ins" },
              ].map((cell) => (
                <div
                  key={cell.title}
                  className="group rounded-xl border border-border/60 bg-background/40 p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:bg-background/60"
                >
                  <cell.icon
                    className="mx-auto mb-3 h-5 w-5 text-accent transition-transform duration-300 group-hover:scale-110"
                    aria-hidden
                  />
                  <p className="text-sm font-semibold tracking-wide uppercase">{cell.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{cell.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="principles" className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-10 text-center text-2xl font-semibold sm:text-3xl">
            How Lumin keeps you honest
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {principles.map((item) => (
              <article
                key={item.title}
                className="group rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-glow"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 transition-colors duration-300 group-hover:bg-accent/20">
                  <item.icon className="h-5 w-5 text-accent" aria-hidden />
                </div>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-10 text-center shadow-panel">
            <div
              className="glow-orb pointer-events-none absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 opacity-25"
              aria-hidden
            />
            <h2 className="relative text-2xl font-semibold sm:text-3xl">Organise your learning</h2>
            <p className="relative mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Weekday classes keep you consistent, weekend sessions reinforce the hard parts,
              extracurriculars round you out and holiday sessions keep momentum. Build the whole
              week in your schedule and never miss a class or a deadline.
            </p>
            <Button
              asChild
              variant="outline"
              className="relative mt-6 border-border/70 bg-background/40 text-foreground backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:border-accent/60 hover:text-foreground"
            >
              <Link to={session ? "/schedule" : "/auth"}>Explore schedule</Link>
            </Button>
          </div>
        </section>

        <section id="site-chat" className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">
            How can this site help me?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
            Ask our chatbot — it can walk you through what ClearPath offers before you sign up.
          </p>
          <div className="mt-8">
            <SiteChatWidget />
          </div>
        </section>
      </main>

      <FloatingChatButton targetId="site-chat" />

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <p>ClearPath · Lumin AI · To illuminate your educational journey</p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <Link to="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <a
            href="https://github.com/Jeev1028/lumin-clearpath"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" aria-hidden />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
