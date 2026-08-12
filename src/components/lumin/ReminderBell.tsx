import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, GraduationCap, MessageSquare, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useTaskReminders } from "@/hooks/useTaskReminders";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/clearpath";

const TYPE_ICON: Record<string, typeof Sparkles> = {
  new_assignment: Sparkles,
  grade: GraduationCap,
  teacher_comment: MessageSquare,
};

export function ReminderBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTone } = useSoundSettings();
  const { overdue, dueToday, total: taskTotal } = useTaskReminders();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const knownUnreadIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    function load() {
      listNotifications()
        .then((data) => {
          if (cancelled) return;
          const unreadIds = new Set(data.filter((n) => !n.read_at).map((n) => n.id));
          const known = knownUnreadIdsRef.current;
          if (known && [...unreadIds].some((id) => !known.has(id))) {
            playTone("notify");
          }
          knownUnreadIdsRef.current = unreadIds;
          setNotifications(data);
        })
        .catch(() => {
          // non-fatal — the bell just won't show notifications this load
        });
    }
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  const items = [...overdue, ...dueToday].slice(0, 6);
  const unreadNotifications = notifications.filter((n) => !n.read_at);
  const total = taskTotal + unreadNotifications.length;

  async function handleNotificationClick(n: AppNotification) {
    if (!n.read_at) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: "now" } : x)));
      try {
        await markNotificationRead(n.id);
      } catch {
        // non-fatal
      }
    }
    if (n.url) void navigate({ to: n.url });
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? "now" })));
    try {
      await markAllNotificationsRead();
    } catch {
      // non-fatal
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/40 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={total > 0 ? `${total} reminders and notifications` : "Reminders and notifications"}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-[70vh] overflow-y-auto border-border/70 bg-card/95 backdrop-blur-sm"
      >
        <DropdownMenuLabel>Task reminders</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">You&apos;re all caught up. 🎉</p>
        ) : (
          items.map((task) => {
            const isOverdue = overdue.some((t) => t.id === task.id);
            return (
              <DropdownMenuItem key={task.id} asChild className="cursor-pointer flex-col items-start gap-0.5">
                <Link to="/tasks">
                  <span className="truncate text-sm font-medium">{task.title}</span>
                  <span className={`text-xs ${isOverdue ? "text-destructive" : "text-accent"}`}>
                    {isOverdue ? `Overdue since ${task.due_date}` : "Due today"}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer justify-center text-xs text-muted-foreground">
          <Link to="/tasks">View all tasks</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadNotifications.length > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="text-xs text-accent hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing new.</p>
        ) : (
          notifications.slice(0, 10).map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <DropdownMenuItem
                key={n.id}
                onClick={() => void handleNotificationClick(n)}
                className="cursor-pointer items-start gap-2"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${n.read_at ? "text-muted-foreground" : "font-medium text-foreground"}`}
                  >
                    {n.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                </span>
                {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
