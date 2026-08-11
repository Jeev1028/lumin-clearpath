import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Bell,
  CalendarClock,
  ClipboardList,
  Compass,
  GraduationCap,
  Layers,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORY_LABELS,
  classroomAverage,
  formatTime,
  getClassroomConnection,
  listCalendarEvents,
  listClassroomCoursework,
  listEvents,
  listNotifications,
  listTasks,
  markNotificationRead,
  type AppNotification,
  type CalendarEvent,
  type ClassroomCoursework,
  type ScheduleEvent,
  type Task,
} from "@/lib/clearpath";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Today — ClearPath by Lumin AI" },
      {
        name: "description",
        content: "Everything due today, your schedule, recent notifications and grades, in one place.",
      },
    ],
  }),
  component: TodayPage,
});

const NOTIFICATION_ICON: Record<string, typeof Sparkles> = {
  new_assignment: Sparkles,
  grade: GraduationCap,
  teacher_comment: MessageSquare,
};

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isOverdue(task: Task, today: string): boolean {
  return Boolean(task.due_date) && task.status !== "submitted" && task.due_date! < today;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return "";
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const full = meta["full_name"] || meta["name"] || user.email || "";
  return full.split(/[\s@]/)[0] || "";
}

const QUICK_ACTIONS = [
  { to: "/tasks" as const, label: "Add a task", icon: ClipboardList },
  { to: "/chat" as const, label: "Ask Lumin AI", icon: Sparkles },
  { to: "/flashcards" as const, label: "Study flashcards", icon: Layers },
  { to: "/knowledge" as const, label: "Explore a topic", icon: Compass },
];

function TodayPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [oneOffEvents, setOneOffEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [coursework, setCoursework] = useState<ClassroomCoursework[] | null>(null);
  const [ready, setReady] = useState(false);

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
    Promise.all([
      listTasks(),
      listEvents(),
      listCalendarEvents(),
      listNotifications(),
      getClassroomConnection(),
    ])
      .then(async ([taskData, eventData, oneOffData, notificationData, connection]) => {
        setTasks(taskData);
        setEvents(eventData);
        setOneOffEvents(oneOffData);
        setNotifications(notificationData);
        if (connection) {
          try {
            setCoursework(await listClassroomCoursework());
          } catch {
            setCoursework(null);
          }
        }
      })
      .catch(() => toast.error("Could not load today's overview."))
      .finally(() => setReady(true));
  }, [loading, user, needsMfa, navigate]);

  const today = todayStr();
  const dow = new Date().getDay();

  const overdueTasks = useMemo(
    () => tasks.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [tasks, today],
  );
  const dueTodayTasks = useMemo(
    () => tasks.filter((t) => t.due_date === today && t.status !== "submitted"),
    [tasks, today],
  );
  function todayStrFor(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const upcomingTasks = useMemo(() => {
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const in7Str = todayStrFor(in7);
    return tasks
      .filter((t) => t.due_date && t.due_date > today && t.due_date <= in7Str && t.status !== "submitted")
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today]);

  const todaySchedule = useMemo(() => {
    type Item = { key: string; title: string; time: string; sub: string | null; sortKey: string };
    const weekly: Item[] = events
      .filter((e) => e.day_of_week === dow)
      .map((e) => ({
        key: `w-${e.id}`,
        title: e.title,
        time: `${formatTime(e.start_time)} – ${formatTime(e.end_time)}`,
        sub: e.location ?? CATEGORY_LABELS[e.category],
        sortKey: e.start_time,
      }));
    const oneOff: Item[] = oneOffEvents
      .filter((e) => e.start_at.slice(0, 10) === today)
      .map((e) => ({
        key: `o-${e.id}`,
        title: e.title,
        time: e.all_day
          ? "All day"
          : new Date(e.start_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        sub: e.location,
        sortKey: e.all_day ? "00:00" : e.start_at.slice(11, 16),
      }));
    return [...weekly, ...oneOff].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [events, oneOffEvents, dow, today]);

  const unreadNotifications = notifications.filter((n) => !n.read_at).slice(0, 5);
  const overallAverage = coursework ? classroomAverage(coursework) : null;

  async function handleNotificationClick(n: AppNotification) {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: "now" } : x)));
    try {
      await markNotificationRead(n.id);
    } catch {
      // non-fatal
    }
    if (n.url) void navigate({ to: n.url });
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-deep">
        <SiteHeader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-6 pb-24">
        <h1 className="text-3xl font-bold">
          {greeting()}
          {user ? `, ${firstName(user)}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.to}
              asChild
              variant="outline"
              size="sm"
              className="gap-1.5 border-border/70 bg-card/40 text-foreground hover:text-foreground"
            >
              <Link to={action.to}>
                <action.icon className="h-3.5 w-3.5" aria-hidden />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Due today & overdue */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <ClipboardList className="h-4 w-4 text-accent" aria-hidden />
                Due today
              </h2>
              <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {overdueTasks.length === 0 && dueTodayTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing due today — you're clear. 🎉</p>
              )}
              {overdueTasks.slice(0, 4).map((t) => (
                <Link
                  key={t.id}
                  to="/tasks"
                  className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm hover:border-destructive/60"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-destructive">Overdue</span>
                </Link>
              ))}
              {dueTodayTasks.slice(0, 4).map((t) => (
                <Link
                  key={t.id}
                  to="/tasks"
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm hover:border-accent/40"
                >
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.course && <span className="shrink-0 text-xs text-muted-foreground">{t.course}</span>}
                </Link>
              ))}
            </div>
            {upcomingTasks.length > 0 && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground">Coming up this week</p>
                <div className="mt-2 space-y-1.5">
                  {upcomingTasks.map((t) => (
                    <Link
                      key={t.id}
                      to="/tasks"
                      className="flex items-center justify-between text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="shrink-0">{t.due_date}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Today's schedule */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
                Today's schedule
              </h2>
              <Link to="/schedule" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {todaySchedule.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing scheduled today.</p>
              )}
              {todaySchedule.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm"
                >
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{item.time}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.sub && (
                    <span className="shrink-0 text-xs text-muted-foreground">{item.sub}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Bell className="h-4 w-4 text-accent" aria-hidden />
              Recent activity
            </h2>
            <div className="mt-3 space-y-2">
              {unreadNotifications.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing new.</p>
              )}
              {unreadNotifications.map((n) => {
                const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleNotificationClick(n)}
                    className="flex w-full items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left text-sm hover:border-accent/40"
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grades */}
          <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
                Grades
              </h2>
              <Link to="/grades" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            {overallAverage !== null ? (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Overall average</p>
                <p className="mt-1 text-3xl font-bold text-accent">{overallAverage}%</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {coursework
                  ? "No graded work yet."
                  : "Connect Google Classroom to see your grades here."}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
