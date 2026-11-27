import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { STAGES, type StageId, uniDb, urgency, type Urgency } from "@/lib/uni-db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/uni_/saved")({
  head: () => ({ meta: [{ title: "My applications — Lumin UNI" }] }),
  component: SavedPage,
  errorComponent: () => (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="font-display text-3xl font-semibold">Your applications hit a problem</h1>
        <p className="mt-3 text-muted-foreground">Reload the page. The rest of ClearPath is not affected.</p>
      </main>
    </div>
  ),
});

type Task = { id: string; title: string; due_date: string | null; done: boolean };
type App = {
  id: string;
  stage: StageId;
  programs: {
    title: string;
    application_url: string;
    application_deadline: string | null;
    deadline_note: string | null;
    deadline_checked: string | null;
    universities: { name: string };
  };
  uni_application_tasks: Task[];
};

const TONE: Record<Urgency, string> = {
  none: "bg-muted/60 text-muted-foreground",
  overdue: "bg-red-500/25 text-red-200",
  urgent: "bg-red-500/25 text-red-200",
  soon: "bg-amber-400/25 text-amber-100",
  ok: "bg-emerald-500/20 text-emerald-200",
};

function deadlineText(d: string | null) {
  const u = urgency(d);
  if (u.level === "none") return "Deadline not collected yet";
  if (u.level === "overdue") return `Deadline passed ${-u.days!} days ago`;
  if (u.days === 0) return "Deadline is today";
  return `${u.days} day${u.days === 1 ? "" : "s"} left`;
}

function SavedPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["uni-apps", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await uniDb
        .from("uni_applications")
        .select(
          "id,stage,programs(title,application_url,application_deadline,deadline_note,deadline_checked,universities(name)),uni_application_tasks(id,title,due_date,done)",
        )
        .order("created_at");
      if (error) throw new Error(error.message);
      return data as App[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["uni-apps"] });
  const fail = (e: Error) => void toast.error(e.message);
  const done = ({ error }: { error: { message: string } | null }) => {
    if (error) fail(new Error(error.message));
    else void refresh();
  };

  if (loading || !user) return null;
  const apps = data ?? [];
  const urgent = apps
    .filter((a) => ["interested", "in_progress"].includes(a.stage))
    .filter((a) => ["urgent", "overdue", "soon"].includes(urgency(a.programs.application_deadline).level))
    .sort((a, b) => (a.programs.application_deadline! > b.programs.application_deadline! ? 1 : -1));

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 pb-20">
        <section className="pt-10 pb-4">
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">My applications</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Track each program from interested to decision, and add your own to-dos like a
            supplemental essay or a reference letter.{" "}
            <Link to="/uni" className="text-accent underline underline-offset-4">
              Find programs to save
            </Link>
          </p>
        </section>

        {urgent.length > 0 && (
          <section aria-label="Deadline reminders" className="mb-6 rounded-2xl border border-border/70 bg-card/70 p-4">
            <h2 className="font-display text-lg font-semibold">Deadlines coming up</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {urgent.map((a) => {
                const u = urgency(a.programs.application_deadline);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[u.level])}>
                      {deadlineText(a.programs.application_deadline)}
                    </span>
                    {a.programs.universities.name}: {a.programs.title}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && apps.length === 0 && (
          <p className="rounded-2xl border border-border/70 bg-card/70 p-6 text-muted-foreground">
            Nothing saved yet. Open a program on the{" "}
            <Link to="/uni" className="text-accent underline underline-offset-4">Lumin UNI page</Link> and choose
            "Save to my applications".
          </p>
        )}

        <div className="space-y-4">
          {apps.map((a) => {
            const u = urgency(a.programs.application_deadline);
            return (
              <article key={a.id} className="rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">
                      {a.programs.universities.name}: {a.programs.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[u.level])}>
                        {deadlineText(a.programs.application_deadline)}
                      </span>
                      {a.programs.application_deadline && (
                        <span className="text-muted-foreground">
                          {a.programs.application_deadline}
                          {a.programs.deadline_checked ? `, checked ${a.programs.deadline_checked}` : ""}
                        </span>
                      )}
                    </div>
                    {a.programs.deadline_note && (
                      <p className="mt-1 text-xs text-muted-foreground">{a.programs.deadline_note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`st-${a.id}`}>Stage</label>
                    <select
                      id={`st-${a.id}`}
                      value={a.stage}
                      onChange={(e) =>
                        void uniDb
                          .from("uni_applications")
                          .update({ stage: e.target.value, updated_at: new Date().toISOString() })
                          .eq("id", a.id)
                          .then(done)
                      }
                      className="rounded-xl border-2 border-border bg-background/60 px-3 py-1.5 text-sm"
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void uniDb
                          .from("uni_applications")
                          .delete()
                          .eq("id", a.id)
                          .then(done)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <TaskList app={a} userId={user.id} onChange={refresh} onError={fail} />

                <a
                  href={a.programs.application_url}
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-accent underline underline-offset-4"
                >
                  Open the university's application page
                </a>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function TaskList({
  app,
  userId,
  onChange,
  onError,
}: {
  app: App;
  userId: string;
  onChange: () => void;
  onError: (e: Error) => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const done = (r: { error: { message: string } | null }) => (r.error ? onError(new Error(r.error.message)) : onChange());

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">To-dos</h3>
      <ul className="mt-1 space-y-1">
        {app.uni_application_tasks.map((t) => {
          const tu = urgency(t.due_date);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={t.done}
                aria-label={`Done: ${t.title}`}
                onChange={(e) => void uniDb.from("uni_application_tasks").update({ done: e.target.checked }).eq("id", t.id).then(done)}
              />
              <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>
              {t.due_date && !t.done && (
                <span className={cn("rounded-full px-2 py-0.5 text-xs", TONE[tu.level])}>{t.due_date}</span>
              )}
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void uniDb.from("uni_application_tasks").delete().eq("id", t.id).then(done)}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = title.trim();
          if (!v) return;
          void uniDb
            .from("uni_application_tasks")
            .insert({ application_id: app.id, user_id: userId, title: v, due_date: due || null })
            .then((r) => {
              if (!r.error) {
                setTitle("");
                setDue("");
              }
              done(r);
            });
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Add a to-do, like a supplemental essay"
          aria-label="New to-do"
          className="min-w-0 flex-1 rounded-xl border-2 border-border bg-background/60 px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="To-do due date"
          className="rounded-xl border-2 border-border bg-background/60 px-3 py-1.5 text-sm"
        />
        <Button type="submit" size="sm" className="bg-gradient-lumin text-primary-foreground">Add</Button>
      </form>
    </div>
  );
}
