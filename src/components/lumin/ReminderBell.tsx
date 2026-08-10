import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

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

export function ReminderBell() {
  const { user } = useAuth();
  const { overdue, dueToday, total } = useTaskReminders();
  if (!user) return null;

  const items = [...overdue, ...dueToday].slice(0, 6);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/40 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={total > 0 ? `${total} task reminders` : "Task reminders"}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 border-border/70 bg-card/95 backdrop-blur-sm">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
