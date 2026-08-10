import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

import { requireUser } from "@/lib/api-auth";
import { STUDY_PLAN_SYSTEM_PROMPT } from "@/lib/study-plan-prompt";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type PlanBody = { horizon?: "week" | "month"; preferences?: string };

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

function formatCalendarEvents(rows: CalendarRow[]): string {
  if (rows.length === 0) return "(none in this window)";
  return rows
    .map((r) => {
      const start = new Date(r.start_at);
      const label = r.all_day
        ? start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        : start.toLocaleString(undefined, {
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
        const horizon = body.horizon === "month" ? "month" : "week";
        const preferences = (body.preferences ?? "").trim().slice(0, 1000);

        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const windowDays = horizon === "month" ? 30 : 7;
        const windowEnd = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000);

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
        if (calendarRes.error) return new Response("Could not load calendar events", { status: 500 });

        const prompt = `Today's date: ${todayStr}. Requested horizon: ${horizon} (plan through ${windowEnd.toISOString().slice(0, 10)}).

STUDENT'S OUTSTANDING TASKS:
${formatTasks(tasksRes.data as TaskRow[])}

FIXED WEEKLY SCHEDULE (recurring every week):
${formatSchedule(scheduleRes.data as ScheduleRow[])}

ONE-OFF EVENTS ALREADY ON THE CALENDAR IN THIS WINDOW:
${formatCalendarEvents(calendarRes.data as CalendarRow[])}

STUDENT'S STATED PREFERENCES:
${preferences || "(none given — use sensible defaults)"}

Produce the plan now, following the output format and boundaries in your instructions.`;

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });

        let text: string;
        try {
          const result = await generateText({
            model: google("gemini-3.6-flash"),
            system: STUDY_PLAN_SYSTEM_PROMPT,
            prompt,
            maxOutputTokens: 1800,
            providerOptions: {
              google: {
                thinkingConfig: { thinkingLevel: "low" },
              },
            },
          });
          text = result.text;
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
