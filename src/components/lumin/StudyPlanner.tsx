import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Horizon = "week" | "month";

type StudyPlan = {
  horizon: Horizon;
  preferences: string | null;
  plan_markdown: string;
  generated_at: string;
  completed_blocks: string[];
};

type PlanDay = { heading: string; items: string[] };
type ParsedPlan = { days: PlanDay[]; why: string };

/** Parses the AI's expected "### Day heading" + "- bullet" format into
 * structured blocks we can attach checkboxes to. Falls back to treating
 * the whole thing as prose (rendered as-is) if the shape doesn't match,
 * so an unexpected AI response never breaks the page. */
function parsePlan(markdown: string): ParsedPlan | null {
  const lines = markdown.split("\n");
  const days: PlanDay[] = [];
  let current: PlanDay | null = null;
  const whyLines: string[] = [];
  let inWhy = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      const heading = line.slice(4).trim();
      if (/^why/i.test(heading)) {
        inWhy = true;
        whyLines.push(rawLine);
        continue;
      }
      if (inWhy) {
        whyLines.push(rawLine);
        continue;
      }
      current = { heading, items: [] };
      days.push(current);
      continue;
    }
    if (inWhy) {
      whyLines.push(rawLine);
    } else if (line.startsWith("- ") && current) {
      current.items.push(line.slice(2).trim());
    }
  }

  if (days.length === 0) return null;
  return { days, why: whyLines.join("\n").trim() };
}

function blockKey(day: string, item: string): string {
  return `${day}__${item}`;
}

export function StudyPlanner() {
  const { session, user } = useAuth();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("week");
  const [preferences, setPreferences] = useState("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const res = await fetch("/api/study-plan", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan: StudyPlan | null };
        if (data.plan) {
          setPlan(data.plan);
          setHorizon(data.plan.horizon);
          setPreferences(data.plan.preferences ?? "");
          setCompleted(new Set(data.plan.completed_blocks ?? []));
        }
      } catch {
        // non-fatal — the generate button still works
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const parsed = useMemo(() => (plan ? parsePlan(plan.plan_markdown) : null), [plan]);

  const totalBlocks = useMemo(
    () => (parsed ? parsed.days.reduce((sum, d) => sum + d.items.length, 0) : 0),
    [parsed],
  );

  async function handleGenerate() {
    if (!session) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ horizon, preferences }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Could not generate a plan right now.");
      const data = JSON.parse(text) as { plan: StudyPlan };
      setPlan(data.plan);
      setCompleted(new Set());
      toast.success("Study plan generated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a plan right now.");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleBlock(key: string) {
    if (!user) return;
    const next = new Set(completed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompleted(next);
    const { error } = await supabase
      .from("study_plans")
      .update({ completed_blocks: [...next] })
      .eq("user_id", user.id);
    if (error) {
      // revert on failure
      setCompleted(completed);
      toast.error("Could not save that checkbox — please try again.");
    }
  }

  if (!session) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
          <Sparkles className="h-5 w-5 text-accent" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold">Lumin study planner</p>
          <p className="text-xs text-muted-foreground">
            Turns your upcoming tasks and schedule into a concrete day-by-day plan, grounded in
            learning-science research, to help cut down on procrastination.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["week", "month"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setHorizon(option)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              horizon === option
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "week" ? "This week" : "This month"}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="study-plan-preferences" className="text-xs text-muted-foreground">
          Preferences (optional)
        </Label>
        <Textarea
          id="study-plan-preferences"
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          placeholder="e.g. I focus best in the mornings, no studying after 9pm, I find math harder than the rest, keep Fridays light…"
          className="min-h-16 resize-y text-sm"
        />
      </div>

      <Button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={generating}
        className="mt-3 bg-gradient-lumin text-primary-foreground shadow-glow"
      >
        {generating ? "Building your plan…" : plan ? "Regenerate plan" : "Generate my plan"}
      </Button>

      {plan && (
        <div className="mt-5 border-t border-border/60 pt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="animate-badge-glow inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
              <Sparkles className="h-3 w-3" aria-hidden />
              Generative AI · A starting point, adjust as needed
            </div>
            <p className="text-xs text-muted-foreground">
              Generated {new Date(plan.generated_at).toLocaleString()}
            </p>
          </div>

          {parsed ? (
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              {totalBlocks > 0 && (
                <div className="mb-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>
                      {completed.size} of {totalBlocks} done
                    </span>
                  </div>
                  <Progress value={(completed.size / totalBlocks) * 100} className="h-1.5" />
                </div>
              )}

              <div className="space-y-4">
                {parsed.days.map((day) => (
                  <div key={day.heading}>
                    <p className="text-sm font-semibold">{day.heading}</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {day.items.map((item) => {
                        const key = blockKey(day.heading, item);
                        const done = completed.has(key);
                        return (
                          <li key={key} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => void toggleBlock(key)}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                              aria-label={item}
                            />
                            <span
                              className={cn(
                                "text-sm leading-relaxed",
                                done ? "text-muted-foreground line-through" : "text-foreground",
                              )}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{ p: ({ children }) => <>{children}</> }}
                              >
                                {item}
                              </ReactMarkdown>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              {parsed.why && (
                <div className="lumin-md mt-5 border-t border-border/60 pt-4 text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.why}</ReactMarkdown>
                </div>
              )}
            </div>
          ) : (
            <div className="lumin-md rounded-xl border border-border/60 bg-background/40 p-4 text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.plan_markdown}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {!plan && !loading && (
        <p className="mt-4 text-xs text-muted-foreground">
          No plan yet — add a few tasks and generate one above.
        </p>
      )}
    </div>
  );
}
