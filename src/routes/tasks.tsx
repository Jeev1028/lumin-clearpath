import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  BookOpenCheck,
  ClipboardList,
  FolderKanban,
  Library,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { StudyPlanner } from "@/components/lumin/StudyPlanner";
import { TaskDetailDialog, type TaskDetailInfo } from "@/components/lumin/TaskDetailDialog";
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
import { cn } from "@/lib/utils";
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

const TASK_KIND_ICONS: Record<TaskKind, typeof BookOpenCheck> = {
  test: BookOpenCheck,
  assignment: ClipboardList,
  project: FolderKanban,
  reading: Library,
};

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/50",
  in_progress: "bg-accent",
  submitted: "bg-emerald-400",
};

const FILTERS = ["all", "todo", "in_progress", "submitted"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  todo: "To do",
  in_progress: "In progress",
  submitted: "Submitted",
};

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isOverdue(task: Task): boolean {
  return Boolean(task.due_date) && task.status !== "submitted" && task.due_date! < todayStr();
}

function TasksPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
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
    listTasks().then(setTasks).catch(() => toast.error("Could not load your tasks."));
  }, [loading, user, needsMfa, navigate]);

  const submitted = tasks.filter((t) => t.status === "submitted").length;
  const overdueCount = tasks.filter(isOverdue).length;
  const pct = tasks.length ? Math.round((submitted / tasks.length) * 100) : 0;

  const filteredTasks = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((t) => t.status === filter)),
    [tasks, filter],
  );

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

        <div className="mt-6">
          <StudyPlanner />
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">Progress</span>
            <span className="flex items-center gap-3 text-muted-foreground">
              {overdueCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {overdueCount} overdue
                </span>
              )}
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

        <div className="mt-6 flex flex-wrap items-center gap-1 rounded-full border border-border/60 bg-card/40 p-1 sm:inline-flex">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-secondary/70 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABELS[f]}
              {f !== "all" && (
                <span className="ml-1.5 text-muted-foreground">
                  {tasks.filter((t) => t.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-3">
          {filteredTasks.map((task) => {
            const Icon = TASK_KIND_ICONS[task.kind];
            const overdue = isOverdue(task);
            return (
              <li
                key={task.id}
                className={cn(
                  "group flex flex-wrap items-center gap-3 rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow",
                  overdue
                    ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
                    : "border-border/70 bg-card/60 hover:border-accent/40",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
                    overdue ? "bg-destructive/10" : "bg-accent/10 group-hover:bg-accent/20",
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5", overdue ? "text-destructive" : "text-accent")}
                    aria-hidden
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailTask(task);
                      setDetailOpen(true);
                    }}
                    className="flex items-center gap-1.5 font-medium hover:underline"
                  >
                    {task.title}
                    {task.source === "classroom" && (
                      <span className="rounded-full border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        via Classroom
                      </span>
                    )}
                  </button>
                  <p
                    className={cn(
                      "text-xs",
                      overdue ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {TASK_KIND_LABELS[task.kind]}
                    {task.course ? ` · ${task.course}` : ""}
                    {task.due_date ? ` · ${overdue ? "overdue since" : "due"} ${task.due_date}` : ""}
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
                        <span
                          className={cn(
                            "mr-1.5 inline-block h-2 w-2 rounded-full",
                            STATUS_DOT[value as TaskStatus],
                          )}
                        />
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
            );
          })}
          {filteredTasks.length === 0 && tasks.length > 0 && (
            <li className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              No tasks match this filter.
            </li>
          )}
          {tasks.length === 0 && (
            <li className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              Nothing tracked yet. Add your first test or assignment above.
            </li>
          )}
        </ul>
      </main>

      <TaskDetailDialog task={detailTask} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
