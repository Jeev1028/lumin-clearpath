import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalLayout } from "@/components/lumin/LegalLayout";

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
    <LegalLayout title="About">
      <div className="mb-10 text-center">
        <p className="text-glow-accent font-display text-2xl leading-snug font-semibold text-accent sm:text-3xl">
          &ldquo;The path worth taking is rarely the easiest&rdquo;
        </p>
        <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:text-sm">
          — Jeevin Birdi, Grade 10 Student, Founder of Lumin AI and Lumin ClearPath
        </p>
      </div>

      <p>
        ClearPath is a passion project: a study platform built by a grade 10 student, including
        Lumin AI, its study companion.
      </p>

      <blockquote className="border-l-2 border-accent/50 pl-4 text-foreground/90 italic">
        I built ClearPath because I was tired of juggling five different apps just to keep track of
        my own schoolwork — and every AI tool I tried either refused to help or just did the
        assignment for me. I wanted something in between: a tutor that actually teaches you, instead
        of one that either shuts you out or does your thinking for you. It's still very much a work
        in progress, built and maintained in spare time, but I'm proud of it, and I'm glad you're
        here.
      </blockquote>

      <h2 className="text-xl font-semibold">What ClearPath is</h2>
      <p>
        ClearPath is a calm study platform: a place to track tests and assignments, lay out a class
        schedule, and work with Lumin AI, a study companion that actually behaves like a tutor
        rather than a ghostwriter.
      </p>

      <h2 className="text-xl font-semibold">What Lumin AI actually does</h2>
      <p>
        Lumin AI explains concepts, asks guiding questions, points you to real sources, and gives
        feedback on work you've already done — all without writing it for you. It won't produce an
        essay, a lab report, or a ready-to-submit outline, and it won't hand you a finished answer
        to a math problem or a name for your school project — it walks you through the method or the
        way to think about it instead, so the thinking stays yours. You can read the full detail of
        how it's expected to behave in our{" "}
        <Link to="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        .
      </p>

      <h2 className="text-xl font-semibold">Get in touch</h2>
      <p>
        If you have feedback, a bug to report, or just want to say hello, reach out at{" "}
        <a href="mailto:lumin-support@luminclearpath.ca">lumin-support@luminclearpath.ca</a>. You
        can also find the project on{" "}
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
    </LegalLayout>
  );
}
