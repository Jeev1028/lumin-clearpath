import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { listTasks, type Task } from "@/lib/clearpath";

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mirrors the exact overdue/due-today logic used on the Tasks page. */
export function useTaskReminders() {
  const { user } = useAuth();
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [dueToday, setDueToday] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOverdue([]);
      setDueToday([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const tasks = await listTasks();
        if (cancelled) return;
        const today = todayStr();
        setOverdue(tasks.filter((t) => t.due_date && t.status !== "submitted" && t.due_date < today));
        setDueToday(tasks.filter((t) => t.due_date === today && t.status !== "submitted"));
      } catch {
        // non-fatal — the bell just won't show a count this load
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    // Refresh whenever the tab regains focus, so the badge stays current
    // as tasks get completed on other pages/tabs.
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [user]);

  return { overdue, dueToday, loading, total: overdue.length + dueToday.length };
}
