import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, Eraser, Link2, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HighDemandNotice } from "@/components/lumin/HighDemandNotice";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildPlanIcs, downloadIcs } from "@/lib/ics";
import { parseHorizonRange, parsePlanBlocks, planStartDate } from "@/lib/study-plan-ics";
import { createThread } from "@/lib/threads";
import { cn } from "@/lib/utils";

const MAX_DAYS = 60;
const PRESET_DAYS = [7, 14, 30];

/** YYYY-MM-DD for a local date, shifted by a number of days. */
function localDate(offsetDays = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
}

function addDays(date: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString("en-CA");
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

type StudyPlan = {
  /** "start/end" dates; older plans saved "week", "month" or a day count. */
  horizon: string;
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
  const navigate = useNavigate();
  const [askingKey, setAskingKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState(() => localDate(0));
  const [endDate, setEndDate] = useState(() => localDate(6));
  const [feedBusy, setFeedBusy] = useState(false);
  const [preferences, setPreferences] = useState("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

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
          const range = parseHorizonRange(data.plan.horizon);
          if (range && range.end >= localDate(0)) {
            setStartDate(range.start < localDate(0) ? localDate(0) : range.start);
            setEndDate(range.end);
          }
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

  const rangeDays = daysBetween(startDate, endDate);
  const rangeError =
    !startDate || !endDate
      ? "Choose a start and end date."
      : rangeDays < 1
        ? "The end date must be on or after the start date."
        : rangeDays > MAX_DAYS
          ? "Please choose " + MAX_DAYS + " days or fewer."
          : null;

  async function handleGenerate() {
    if (!session) return;
    if (rangeError) {
      toast.error(rangeError);
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/study-plan", {
        method: "POST",
        signal: AbortSignal.timeout(150_000),
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          preferences,
          // The student's local date, so "today" is right near midnight UTC.
          today: new Date().toLocaleDateString("en-CA"),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Could not generate a plan right now.");
      const data = JSON.parse(text) as { plan: StudyPlan };
      setPlan(data.plan);
      setCompleted(new Set());
      toast.success("Study plan generated.");
    } catch (err) {
      toast.error(
        err instanceof Error && err.name !== "TimeoutError" && err.name !== "AbortError"
          ? err.message
          : "Building the plan is taking too long. Try again, or choose a shorter date range.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleClear() {
    if (!user) return;
    setClearing(true);
    try {
      const { error } = await supabase.from("study_plans").delete().eq("user_id", user.id);
      if (error) throw error;
      setPlan(null);
      setCompleted(new Set());
      setConfirmClear(false);
      toast.success("Study plan cleared.");
    } catch {
      toast.error("Could not clear your study plan. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  /** Opens a new Lumin chat with this study block already described. */
  async function handleAskLumin(dayHeading: string, item: string, key: string, dayItems: string[]) {
    if (!user) return;
    setAskingKey(key);
    try {
      const plain = item.replace(/[*_`]/g, "").trim();
      const others = dayItems
        .filter((o) => o !== item)
        .slice(0, 12)
        .map((o) => "- " + o.replace(/[*_`]/g, "").trim());
      const prompt = [
        "I'm working on this study block from my Lumin study plan.",
        `When: ${dayHeading}`,
        `Task: ${plain}`,
        ...(others.length ? ["", "The rest of my plan for that day:", ...others] : []),
        "",
        "How my study plan was built (keep helping in this spirit): spaced practice across several shorter sessions, mixing subjects, active recall (self-quizzing, practice problems) over rereading, focused 25-50 minute blocks with short breaks, concrete when-and-what commitments, and protected rest. Only help with WHEN and HOW to work; never do the assignment itself.",
        "",
        "Help me get started on this one. Ask me what you need to know first (what the assignment is, what I've done so far). Don't do the work for me; help me plan it and understand it.",
      ].join("\n");
      const thread = await createThread(user.id);
      try {
        sessionStorage.setItem(`clearpath:chat-prefill:${thread.id}`, prompt);
      } catch {
        // worst case the chat just opens with an empty input
      }
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a conversation with Lumin.");
    } finally {
      setAskingKey(null);
    }
  }

  function planBlocks() {
    if (!plan) return [];
    return parsePlanBlocks(plan.plan_markdown, planStartDate(plan.horizon, plan.generated_at));
  }

  function handleExport() {
    const blocks = planBlocks();
    if (blocks.length === 0) {
      toast.error("No timed blocks found in this plan to export.");
      return;
    }
    downloadIcs("lumin-study-plan.ics", buildPlanIcs(blocks));
    toast.success(
      "Downloaded " + blocks.length + " study blocks. Open the file to add them to your calendar.",
    );
  }

  async function handleSubscribe() {
    if (!session) return;
    setFeedBusy(true);
    try {
      const res = await fetch("/api/calendar-feed/link", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("link");
      const { httpsUrl } = (await res.json()) as { httpsUrl: string };
      await navigator.clipboard.writeText(httpsUrl);
      toast.success(
        "Subscription link copied. In Google Calendar choose Other calendars, From URL. In Apple Calendar choose File, New Calendar Subscription.",
      );
    } catch {
      toast.error("Could not create a subscription link. Please try again.");
    } finally {
      setFeedBusy(false);
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
        <Label htmlFor="study-plan-start" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="study-plan-start"
          type="date"
          value={startDate}
          min={localDate(0)}
          onChange={(e) => {
            const next = e.target.value;
            setStartDate(next);
            if (next && endDate && endDate < next) setEndDate(next);
          }}
          className="h-8 w-auto text-sm"
        />
        <Label htmlFor="study-plan-end" className="text-xs text-muted-foreground">
          to
        </Label>
        <Input
          id="study-plan-end"
          type="date"
          value={endDate}
          min={startDate || localDate(0)}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-8 w-auto text-sm"
        />
        {PRESET_DAYS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setEndDate(addDays(startDate || localDate(0), n - 1))}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              rangeDays === n
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {n === 7 ? "1 week" : n === 14 ? "2 weeks" : "30 days"}
          </button>
        ))}
      </div>
      {rangeError ? (
        <p className="mt-1.5 text-xs text-destructive">{rangeError}</p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {rangeDays} {rangeDays === 1 ? "day" : "days"} (up to {MAX_DAYS})
        </p>
      )}

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

      <HighDemandNotice active={generating} className="mt-3" />
      <Button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={generating || rangeError !== null}
        className="mt-3 bg-gradient-lumin text-primary-foreground shadow-glow"
      >
        {generating ? "Building your plan…" : plan ? "Update plan" : "Generate my plan"}
      </Button>
      {plan && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmClear(true)}
          disabled={generating}
          className="mt-3 ml-2 gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
          Clear schedule
        </Button>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your study schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your current study plan and your progress checkboxes. Your tasks and
              class schedule are not affected. You can generate a new plan any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={(e) => {
                e.preventDefault();
                void handleClear();
              }}
            >
              {clearing ? "Clearing…" : "Clear schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              Download .ics
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSubscribe()}
              disabled={feedBusy}
              className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {feedBusy ? "Creating link…" : "Copy subscription link"}
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            The subscription link keeps your calendar app updated with this plan, plus your classes
            and due dates, each time you regenerate it.
          </p>

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
                            <button
                              type="button"
                              onClick={() => void handleAskLumin(day.heading, item, key, day.items)}
                              disabled={askingKey === key}
                              title="Talk to Lumin about this"
                              aria-label={`Talk to Lumin about: ${item}`}
                              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              <MessageCircle className="h-3 w-3" aria-hidden />
                              <span className="hidden sm:inline">Talk to Lumin</span>
                            </button>
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
