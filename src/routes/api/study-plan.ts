import { createFileRoute } from "@tanstack/react-router";

import { generateTextWithFallback } from "@/lib/ai-fallback";
import { requireUser } from "@/lib/api-auth";
import { STUDY_PLAN_SYSTEM_PROMPT } from "@/lib/study-plan-prompt";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type PlanBody = {
  days?: number;
  horizon?: string;
  preferences?: string;
  today?: string;
  timeZone?: string;
};

type TaskRow = {
  title: string;
  course: string | null;
  kind: string;
  status: string;
  due_date: string | null;
};

type ScheduleRow = {
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
};

type CalendarRow = {
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
};

function formatTasks(tasks: TaskRow[]): string {
  if (tasks.length === 0) return "(no outstanding tasks)";
  return tasks
    .map((t) => {
      const due = t.due_date ? `due ${t.due_date}` : "no due date set";
      const status = t.status === "in_progress" ? ", in progress" : "";
      return `- ${t.title} (${t.course ?? "no course"}, ${t.kind}) — ${due}${status}`;
    })
    .join("\n");
}

function formatSchedule(rows: ScheduleRow[]): string {
  if (rows.length === 0) return "(no fixed weekly schedule saved)";
  const byDay = new Map<number, ScheduleRow[]>();
  for (const row of rows) {
    const list = byDay.get(row.day_of_week) ?? [];
    list.push(row);
    byDay.set(row.day_of_week, list);
  }
  const lines: string[] = [];
  for (let day = 0; day < 7; day++) {
    const items = byDay.get(day);
    if (!items?.length) continue;
    const parts = items
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((r) => `${r.start_time.slice(0, 5)}-${r.end_time.slice(0, 5)} ${r.title}`);
    lines.push(`- ${DAY_NAMES[day]}: ${parts.join("; ")}`);
  }
  return lines.length ? lines.join("\n") : "(no fixed weekly schedule saved)";
}

function formatCalendarEvents(rows: CalendarRow[], timeZone: string): string {
  if (rows.length === 0) return "(none in this window)";
  return rows
    .map((r) => {
      const start = new Date(r.start_at);
      const label = r.all_day
        ? start.toLocaleDateString("en-CA", {
            timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : start.toLocaleString("en-CA", {
            timeZone,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
      return `- ${label} — ${r.title}`;
    })
    .join("\n");
}

export const Route = createFileRoute("/api/study-plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { data, error } = await auth.supabase
          .from("study_plans")
          .select("horizon, preferences, plan_markdown, generated_at, completed_blocks")
          .maybeSingle();
        if (error) return new Response("Could not load study plan", { status: 500 });
        return Response.json({ plan: data });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, supabase } = auth;

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as PlanBody;
        // Any number of days from 1 to 60 (older clients send "week" / "month").
        const requestedDays = Math.round(Number(body.days));
        const windowDays = Number.isFinite(requestedDays)
          ? Math.min(60, Math.max(1, requestedDays))
          : body.horizon === "month"
            ? 30
            : 7;
        const horizon = String(windowDays);
        const preferences = (body.preferences ?? "").trim().slice(0, 4000);

        // Format times in the student's timezone. The server runs in UTC, which
        // moved a 2-5pm event to 9pm-midnight in the plan.
        let timeZone = "America/Toronto";
        try {
          if (body.timeZone) {
            new Intl.DateTimeFormat("en-CA", { timeZone: body.timeZone });
            timeZone = body.timeZone;
          }
        } catch {
          // keep the default
        }
        const DAY_MS = 24 * 60 * 60 * 1000;
        // The student's own local date (falls back to the server's).
        const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? "")
          ? (body.today as string)
          : new Date().toISOString().slice(0, 10);
        const today = new Date();
        // A rolling window starting today: 7 or 30 days including today.
        const lastDay = new Date(
          new Date(`${todayStr}T00:00:00Z`).getTime() + (windowDays - 1) * DAY_MS,
        );
        const lastDayStr = lastDay.toISOString().slice(0, 10);
        const windowEnd = new Date(lastDay.getTime() + 2 * DAY_MS);

        const [tasksRes, scheduleRes, calendarRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("title, course, kind, status, due_date")
            .neq("status", "submitted")
            .order("due_date", { ascending: true, nullsFirst: false }),
          supabase
            .from("schedule_events")
            .select("title, day_of_week, start_time, end_time, location"),
          supabase
            .from("calendar_events")
            .select("title, start_at, end_at, all_day")
            .gte("start_at", today.toISOString())
            .lte("start_at", windowEnd.toISOString())
            .order("start_at", { ascending: true }),
        ]);
        if (tasksRes.error) return new Response("Could not load tasks", { status: 500 });
        if (scheduleRes.error) return new Response("Could not load schedule", { status: 500 });
        if (calendarRes.error)
          return new Response("Could not load calendar events", { status: 500 });

        const fullDay =
          /\b(breaks?|eat|eating|meals?|breakfast|lunch|dinner|snacks?|outside|outdoors?|walk|exercise|sleep|bed ?time|whole day|entire day|full day|all day|every hour|define my life|rest)\b/i.test(
            preferences,
          );

        // Hand back the current plan so a request like "keep Fridays light" or
        // "move chemistry earlier" edits it, instead of starting from scratch.
        const { data: existing } = await supabase
          .from("study_plans")
          .select("plan_markdown")
          .maybeSingle();
        const previousPlan = existing?.plan_markdown?.trim() ?? "";

        const prompt = `Today's date: ${todayStr}. Plan window: ${windowDays} days, from ${todayStr} through ${lastDayStr} inclusive. Cover every day in that window that has something to schedule, through the last day. Do not stop at the end of a calendar week or month.

STUDENT'S OUTSTANDING TASKS:
${formatTasks(tasksRes.data as TaskRow[])}

FIXED WEEKLY SCHEDULE (recurring every week):
${formatSchedule(scheduleRes.data as ScheduleRow[])}

ONE-OFF EVENTS ALREADY ON THE CALENDAR IN THIS WINDOW:
${formatCalendarEvents(calendarRes.data as CalendarRow[], timeZone)}

STUDENT'S HARD CONSTRAINTS AND REQUESTED CHANGES (every one of these is a rule, not a suggestion; a block that breaks one is a wrong answer):
${preferences || "(none given — use sensible defaults)"}
${
  previousPlan && preferences
    ? `
THE STUDENT'S CURRENT PLAN (revise this one: apply every requested change above, keep the parts they did not mention, and shift dates to match the window above):
${previousPlan}
`
    : ""
}
${
  fullDay
    ? "\nThe student asked for breaks, meals, or time outside, so use FULL-DAY MODE from your instructions: a complete timeline for every day in the window, with meals, breaks after focused work, and outdoor time included as bullets with exact times.\n"
    : ""
}
Before you answer, check every block you wrote against the constraints above and against the fixed schedule and calendar events (including times the student says they are busy or unavailable, and days they do not want to work). Remove or move any block that overlaps or is on a forbidden day. Then produce the plan, following the output format and boundaries in your instructions.`;

        let text: string;
        try {
          text = await generateTextWithFallback({
            system: STUDY_PLAN_SYSTEM_PROMPT,
            prompt,
            maxOutputTokens: fullDay
              ? Math.min(14000, 1500 + windowDays * 600)
              : Math.min(8000, 1000 + windowDays * 200),
            // A plan is a long answer, so give each model a fair try but never
            // leave the student watching a spinner for minutes.
            perModelMs: fullDay ? 55_000 : 40_000,
            totalMs: 125_000,
          });
        } catch (err) {
          console.error("[study-plan] generation failed", err);
          return new Response("Could not generate a plan right now — please try again.", {
            status: 502,
          });
        }
        if (!text?.trim()) {
          return new Response("Could not generate a plan right now — please try again.", {
            status: 502,
          });
        }

        const generatedAt = new Date().toISOString();
        const { error: saveError } = await supabase.from("study_plans").upsert({
          user_id: userId,
          horizon,
          preferences: preferences || null,
          plan_markdown: text,
          generated_at: generatedAt,
          completed_blocks: [],
        });
        if (saveError) console.error("[study-plan] failed to save plan", saveError);

        return Response.json({
          plan: {
            horizon,
            preferences: preferences || null,
            plan_markdown: text,
            generated_at: generatedAt,
            completed_blocks: [] as string[],
          },
        });
      },
    },
  },
});
