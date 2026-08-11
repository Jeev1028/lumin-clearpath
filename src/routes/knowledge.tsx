import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Compass, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { createThread } from "@/lib/threads";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Graph — ClearPath by Lumin AI" },
      {
        name: "description",
        content:
          "Break a topic down into a map of related sub-concepts to research yourself — Lumin never explains the topic for you, only shows you what's worth exploring.",
      },
    ],
  }),
  component: KnowledgePage,
});

type GraphNode = {
  topic: string;
  summary: string;
  subtopics: string[];
  sources: { title: string; url: string }[];
};

const RADIUS = 160;
const CENTER = 200;

function KnowledgePage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [input, setInput] = useState("");
  const [path, setPath] = useState<string[]>([]);
  const [node, setNode] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
    }
  }, [loading, user, needsMfa, navigate]);

  const positions = useMemo(() => {
    const count = node?.subtopics.length ?? 0;
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      return {
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle),
      };
    });
  }, [node]);

  async function explore(topic: string, nextPath: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ topic, path: nextPath.slice(0, -1) }),
      });
      const data = (await res.json().catch(() => ({}))) as Omit<GraphNode, "topic"> & {
        error?: string;
      };
      if (!res.ok) throw new Error("Could not generate that map right now.");
      setNode({ ...data, topic });
      setPath(nextPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate that map right now.");
    } finally {
      setBusy(false);
    }
  }

  async function authHeader(): Promise<string> {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return `Bearer ${data.session?.access_token ?? ""}`;
  }

  function handleStart(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    void explore(input.trim(), [input.trim()]);
  }

  function handleJumpTo(index: number) {
    const topic = path[index];
    if (!topic) return;
    void explore(topic, path.slice(0, index + 1));
  }

  async function handleAskLumin() {
    if (!user || !node) return;
    setAsking(true);
    try {
      const prompt = `Can you help me start researching "${node.topic}"? I'm particularly interested in: ${node.subtopics.slice(0, 3).join(", ")}.`;
      const thread = await createThread(user.id);
      try {
        sessionStorage.setItem(`clearpath:chat-prefill:${thread.id}`, prompt);
      } catch {
        // ignore
      }
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a conversation with Lumin.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Break any topic down into a map of related concepts worth researching — Lumin only ever
          names what's worth exploring, never explains it for you.
        </p>

        <form onSubmit={handleStart} className="mt-6 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you want to understand? e.g. Photosynthesis"
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={busy || !input.trim()}
            className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
          >
            <Compass className="h-4 w-4" aria-hidden />
            {busy ? "Mapping…" : "Explore"}
          </Button>
        </form>

        {path.length > 0 && (
          <nav aria-label="Topic breadcrumb" className="mt-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {path.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
                <button
                  type="button"
                  onClick={() => handleJumpTo(i)}
                  disabled={busy}
                  className={
                    i === path.length - 1
                      ? "font-medium text-foreground"
                      : "underline underline-offset-4 hover:text-foreground"
                  }
                >
                  {p}
                </button>
              </span>
            ))}
          </nav>
        )}

        {node && (
          <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
            <div className="relative mx-auto" style={{ width: 400, height: 400, maxWidth: "100%" }}>
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 400"
                aria-hidden
              >
                {positions.map((p, i) => (
                  <line
                    key={i}
                    x1={CENTER}
                    y1={CENTER}
                    x2={p.x}
                    y2={p.y}
                    stroke="currentColor"
                    className="text-border/70"
                    strokeWidth={1.5}
                  />
                ))}
              </svg>

              <div
                className="absolute flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-lumin p-3 text-center text-xs font-semibold leading-tight break-words text-white shadow-glow"
                style={{ left: CENTER, top: CENTER }}
              >
                {node.topic}
              </div>

              {node.subtopics.map((subtopic, i) => {
                const p = positions[i]!;
                return (
                  <button
                    key={subtopic}
                    type="button"
                    disabled={busy}
                    onClick={() => void explore(subtopic, [...path, subtopic])}
                    className="absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent/50 bg-background/90 p-2 text-center text-[11px] font-medium leading-tight text-foreground shadow-panel transition-transform hover:scale-105 hover:border-accent disabled:opacity-60"
                    style={{ left: p.x, top: p.y }}
                  >
                    {subtopic}
                  </button>
                );
              })}
            </div>

            <p className="mt-6 text-sm text-muted-foreground">{node.summary}</p>

            {node.sources.length > 0 && (
              <div className="mt-4 border-t border-border/60 pt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sources to start with
                </p>
                <ul className="space-y-1">
                  {node.sources.map((s, i) => (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-accent underline underline-offset-4"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cite these in MLA format yourself once you've read them.
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => void handleAskLumin()}
              disabled={asking}
              className="mt-4 gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {asking ? "Starting…" : "Ask Lumin about this"}
            </Button>
          </div>
        )}

        {!node && !busy && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Type a topic above to see its map of related concepts. Click any node to explore
            deeper.
          </p>
        )}
      </main>
    </div>
  );
}
