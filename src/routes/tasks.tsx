import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  type Task,
  type TaskKind,
  type TaskStatus,
  createTask,
  deleteTask,
  listTasks,
  updateTaskStatus,
} from "@/lib/clearpath";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — ClearPath by Lumin AI" },
      {
        name: "description",
        content:
          "Track tests, assignments, projects and readings in one place, with progress monitoring built for students.",
      },
      { property: "og:title", content: "Tasks — ClearPath by Lumin AI" },
      {
        property: "og:description",
        content: "Assignments made easy: track every test, project and hand-in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TasksPage,
});

const emptyDraft = {
  title: "",
  course: "",
  kind: "assignment" as TaskKind,
  due_date: "",
};

function TasksPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    listTasks().then(setTasks).catch(() => toast.error("Could not load your tasks."));
  }, [loading, user, navigate]);

  const submitted = tasks.filter((t) => t.status === "submitted").length;
  const pct = tasks.length ? Math.round((submitted / tasks.length) * 100) : 0;

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !draft.title.trim()) return;
    setBusy(true);
    try {
      const created = await createTask(user.id, {
        title: draft.title.trim(),
        course: draft.course.trim() || null,
        kind: draft.kind,
        status: "todo",
        due_date: draft.due_date || null,
        notes: null,
      });
      setTasks((prev) => [created, ...prev]);
      setDraft(emptyDraft);
    } catch {
      toast.error("Could not save that task.");
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(id: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await updateTaskStatus(id, status);
    } catch {
      toast.error("Could not update that task.");
    }
  }

  async function onDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
    } catch {
      toast.error("Could not remove that task.");
    }
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tests, assignments and hand-ins in one calm list. Progress updates as you submit.
        </p>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="text-muted-foreground">
              {submitted} of {tasks.length} submitted
            </span>
          </div>
          <Progress value={pct} />
        </div>

        <form
          onSubmit={onAdd}
          className="mt-6 grid gap-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="title">Task</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Biology unit test"
              required
            />
          </div>
          <div>
            <Label htmlFor="course">Course</Label>
            <Input
              id="course"
              value={draft.course}
              onChange={(e) => setDraft({ ...draft, course: e.target.value })}
              placeholder="SBI3U"
            />
          </div>
          <div>
            <Label htmlFor="kind">Type</Label>
            <Select
              value={draft.kind}
              onValueChange={(value) => setDraft({ ...draft, kind: value as TaskKind })}
            >
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="due">Due date</Label>
            <Input
              id="due"
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-lumin text-primary-foreground"
            >
              Add task
            </Button>
          </div>
        </form>

        <ul className="mt-6 space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-4"
            >
              <div className="min-w-40 flex-1">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {TASK_KIND_LABELS[task.kind]}
                  {task.course ? ` · ${task.course}` : ""}
                  {task.due_date ? ` · due ${task.due_date}` : ""}
                </p>
              </div>
              <Select
                value={task.status}
                onValueChange={(value) => void onStatus(task.id, value as TaskStatus)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${task.title}`}
                onClick={() => void onDelete(task.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              Nothing tracked yet. Add your first test or assignment above.
            </li>
          )}
        </ul>
      </main>
    </div>
  );
}