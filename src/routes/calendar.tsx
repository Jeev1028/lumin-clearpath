import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { BookOpenCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { TaskDetailDialog, type TaskDetailInfo } from "@/components/lumin/TaskDetailDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORY_LABELS,
  DAY_NAMES,
  formatTime,
  listCalendarEvents,
  listEvents,
  listTasks,
  type CalendarEvent,
  type ScheduleEvent,
  type Task,
} from "@/lib/clearpath";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — ClearPath by Lumin AI" },
      {
        name: "description",
        content:
          "Everything in one month view — classes, one-off events, and every assignment due date, from ClearPath and Google Classroom alike.",
      },
    ],
  }),
  component: CalendarPage,
});

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function CalendarPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [oneOffEvents, setOneOffEvents] = useState<CalendarEvent[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [detailTask, setDetailTask] = useState<TaskDetailInfo | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    Promise.all([listTasks(), listEvents(), listCalendarEvents()])
      .then(([taskData, scheduleData, oneOffData]) => {
        setTasks(taskData);
        setScheduleEvents(scheduleData);
        setOneOffEvents(oneOffData);
      })
      .catch(() => toast.error("Could not load your calendar."));
  }, [loading, user, needsMfa, navigate]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    }
    return map;
  }, [tasks]);

  const oneOffByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of oneOffEvents) {
      const key = toDateKey(new Date(e.start_at));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [oneOffEvents]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  function dayItems(day: Date) {
    const key = toDateKey(day);
    const recurring = scheduleEvents.filter((e) => e.day_of_week === day.getDay());
    const oneOff = oneOffByDate.get(key) ?? [];
    const dueTasks = tasksByDate.get(key) ?? [];
    return { recurring, oneOff, dueTasks };
  }

  const selected = dayItems(selectedDay);

  function openTask(task: Task) {
    setDetailTask(task);
    setDetailOpen(true);
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Classes, one-off events, and every assignment due date — merged from Schedule and
          Classroom in one place.
        </p>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => setMonth((m) => subMonths(m, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonth(startOfMonth(new Date()));
                  setSelectedDay(new Date());
                }}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                onClick={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {DAY_NAMES.map((name) => (
              <div key={name}>{name.slice(0, 3)}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const { recurring, oneOff, dueTasks } = dayItems(day);
              const totalDots = recurring.length + oneOff.length + dueTasks.length;
              const inMonth = isSameMonth(day, month);
              const isSelected = isSameDay(day, selectedDay);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "flex min-h-16 flex-col items-start rounded-lg border p-1.5 text-left transition-colors",
                    inMonth ? "border-border/60 bg-background/40" : "border-transparent bg-transparent opacity-40",
                    isSelected && "border-accent/70 bg-accent/10",
                    isToday(day) && !isSelected && "border-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isToday(day) ? "text-accent" : "text-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {totalDots > 0 && (
                    <div className="mt-auto flex flex-wrap gap-0.5 pt-1">
                      {dueTasks.slice(0, 3).map((_, i) => (
                        <span key={`t${i}`} className="h-1.5 w-1.5 rounded-full bg-accent" />
                      ))}
                      {oneOff.slice(0, 3).map((_, i) => (
                        <span key={`o${i}`} className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      ))}
                      {recurring.slice(0, 2).map((_, i) => (
                        <span key={`r${i}`} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
            {format(selectedDay, "EEEE, MMMM d")}
          </h2>

          {selected.dueTasks.length === 0 &&
            selected.oneOff.length === 0 &&
            selected.recurring.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">Nothing scheduled this day.</p>
            )}

          {selected.dueTasks.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />
                Due today
              </p>
              <ul className="space-y-1.5">
                {selected.dueTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTask(t)}
                      className="w-full rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-left text-sm hover:border-accent/50"
                    >
                      <span className="font-medium">{t.title}</span>
                      {t.course ? <span className="text-muted-foreground"> · {t.course}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected.oneOff.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Events
              </p>
              <ul className="space-y-1.5">
                {selected.oneOff.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-sm">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {new Date(e.start_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {e.location ? ` · ${e.location}` : ""}
                      {e.source === "google" ? " · Google Calendar" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected.recurring.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                Classes
              </p>
              <ul className="space-y-1.5">
                {selected.recurring.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-sm">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {formatTime(e.start_time)}–{formatTime(e.end_time)} ·{" "}
                      {CATEGORY_LABELS[e.category]}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      <TaskDetailDialog
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSubmissionChanged={() => void listTasks().then(setTasks)}
      />
    </div>
  );
}
