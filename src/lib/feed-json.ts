import type { CalendarEvent, ScheduleEvent, Task } from "@/lib/clearpath";
import type { PlanBlock } from "@/lib/study-plan-ics";

// A plain, already-expanded list of items for native apps (the Lumin Calendar
// iOS app), so they don't need to understand recurring-event rules.
//
// Two time styles, flagged by `floating`:
//  - floating: local wall-clock "YYYY-MM-DDTHH:MM" (weekly classes, plan blocks)
//  - otherwise: an absolute UTC instant ending in "Z" (one-off calendar events)

export type FeedItem = {
  id: string;
  kind: "class" | "event" | "task" | "plan";
  title: string;
  /** Start; a date only ("YYYY-MM-DD") when allDay. */
  start: string;
  end: string;
  allDay: boolean;
  floating: boolean;
  location: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function floating(date: string, minutes: number): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function timeToMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

export function buildFeedItems(input: {
  from: string;
  days: number;
  schedule: ScheduleEvent[];
  calendar: CalendarEvent[];
  tasks: Pick<Task, "id" | "title" | "course" | "due_date">[];
  planBlocks: PlanBlock[];
}): FeedItem[] {
  const { from, days, schedule, calendar, tasks, planBlocks } = input;
  const startMs = new Date(`${from}T00:00:00Z`).getTime();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(startMs + i * DAY_MS).toISOString().slice(0, 10));
  }
  const inWindow = new Set(dates);
  const items: FeedItem[] = [];

  for (const date of dates) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const e of schedule) {
      if (e.day_of_week !== dow) continue;
      items.push({
        id: `class-${e.id}-${date}`,
        kind: "class",
        title: e.title,
        start: floating(date, timeToMinutes(e.start_time)),
        end: floating(date, timeToMinutes(e.end_time)),
        allDay: false,
        floating: true,
        location: e.location ?? null,
      });
    }
  }

  // One-off events: include those that start within a day of the window, so
  // time zones never drop an event; the app filters to its own local days.
  const lo = startMs - DAY_MS;
  const hi = startMs + (days + 1) * DAY_MS;
  for (const e of calendar) {
    const t = new Date(e.start_at).getTime();
    if (t < lo || t > hi) continue;
    items.push({
      id: `event-${e.id}`,
      kind: "event",
      title: e.title,
      start: e.all_day ? e.start_at.slice(0, 10) : new Date(e.start_at).toISOString(),
      end: e.all_day ? e.end_at.slice(0, 10) : new Date(e.end_at).toISOString(),
      allDay: e.all_day,
      floating: false,
      location: e.location ?? null,
    });
  }

  for (const t of tasks) {
    if (!t.due_date || !inWindow.has(t.due_date)) continue;
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      title: `Due: ${t.title}${t.course ? ` (${t.course})` : ""}`,
      start: t.due_date,
      end: t.due_date,
      allDay: true,
      floating: true,
      location: null,
    });
  }

  for (const b of planBlocks) {
    if (!inWindow.has(b.date)) continue;
    items.push({
      // Stable across regenerations, so a ticked box stays ticked.
      id: `plan-${b.date}-${b.startMin}-${b.title}`,
      kind: "plan",
      title: b.title,
      start: floating(b.date, b.startMin),
      end: floating(b.date, b.endMin),
      allDay: false,
      floating: true,
      location: null,
    });
  }

  return items;
}
