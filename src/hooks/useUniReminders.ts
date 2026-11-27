import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { uniDb, urgency } from "@/lib/uni-db";

export type UniReminder = { id: string; label: string; when: string; red: boolean; date: string };

type Row = {
  id: string;
  stage: string;
  programs: { title: string; application_deadline: string | null; universities: { name: string } };
  uni_application_tasks: { id: string; title: string; due_date: string | null; done: boolean }[];
};

function whenText(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Deadlines of saved programs (within 21 days) and open to-dos (within 7 days), soonest first. */
export function useUniReminders() {
  const { user } = useAuth();
  const [items, setItems] = useState<UniReminder[]>([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    function load() {
      uniDb
        .from("uni_applications")
        .select(
          "id,stage,programs(title,application_deadline,universities(name)),uni_application_tasks(id,title,due_date,done)",
        )
        .then(({ data, error }) => {
          if (cancelled || error) return; // non-fatal: the bell just shows no UNI items
          const out: UniReminder[] = [];
          for (const a of (data as Row[] | null) ?? []) {
            const dl = a.programs.application_deadline;
            const u = urgency(dl);
            if (["interested", "in_progress"].includes(a.stage) && u.level !== "ok" && u.level !== "none") {
              out.push({
                id: `a-${a.id}`,
                label: `${a.programs.universities.name} deadline`,
                when: whenText(u.days!),
                red: u.level !== "soon",
                date: dl!,
              });
            }
            for (const t of a.uni_application_tasks) {
              const tu = urgency(t.due_date);
              if (!t.done && ["overdue", "urgent"].includes(tu.level)) {
                out.push({ id: `t-${t.id}`, label: t.title, when: whenText(tu.days!), red: true, date: t.due_date! });
              }
            }
          }
          setItems(out.sort((x, y) => (x.date > y.date ? 1 : -1)));
        });
    }
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [user]);

  return items;
}
