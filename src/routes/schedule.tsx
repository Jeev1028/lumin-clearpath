import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORY_LABELS,
  DAY_NAMES,
  type ScheduleCategory,
  type ScheduleEvent,
  createEvent,
  deleteEvent,
  formatTime,
  listEvents,
} from "@/lib/clearpath";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Class schedule — ClearPath by Lumin AI" },
      {
        name: "description",
        content:
          "Organise weekday classes, weekend sessions, extracurriculars and holiday learning in one weekly view.",
      },
      { property: "og:title", content: "Class schedule — ClearPath by Lumin AI" },
      {
        property: "og:description",
        content: "Never miss a class: your full week, laid out calmly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

const emptyDraft = {
  title: "",
  category: "weekday" as ScheduleCategory,
  day_of_week: "1",
  start_time: "09:00",
  end_time: "10:00",
  location: "",
};

function SchedulePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    listEvents().then(setEvents).catch(() => toast.error("Could not load your schedule."));
  }, [loading, user, navigate]);

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !draft.title.trim()) return;
    setBusy(true);
    try {
      const created = await createEvent(user.id, {
        title: draft.title.trim(),
        category: draft.category,
        day_of_week: Number(draft.day_of_week),
        start_time: draft.start_time,
        end_time: draft.end_time,
        location: draft.location.trim() || null,
      });
      setEvents((prev) =>
        [...prev, created].sort(
          (a, b) =>
            a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
        ),
      );
      setDraft({ ...emptyDraft, category: draft.category });
    } catch {
      toast.error("Could not save that class.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteEvent(id);
    } catch {
      toast.error("Could not remove that class.");
    }
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Class schedule</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Weekday classes, weekend sessions, extracurriculars and holiday learning — one week at
          a glance.
        </p>

        <form
          onSubmit={onAdd}
          className="mt-6 grid gap-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel sm:grid-cols-3"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="event-title">Class or session</Label>
            <Input
              id="event-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Chemistry lecture"
              required
            />
          </div>
          <div>
            <Label htmlFor="category">Type</Label>
            <Select
              value={draft.category}
              onValueChange={(value) =>
                setDraft({ ...draft, category: value as ScheduleCategory })
              }
            >
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="day">Day</Label>
            <Select
              value={draft.day_of_week}
              onValueChange={(value) => setDraft({ ...draft, day_of_week: value })}
            >
              <SelectTrigger id="day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((name, index) => (
                  <SelectItem key={name} value={String(index)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="start">Starts</Label>
            <Input
              id="start"
              type="time"
              value={draft.start_time}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="end">Ends</Label>
            <Input
              id="end"
              type="time"
              value={draft.end_time}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="location">Room or link</Label>
            <Input
              id="location"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              placeholder="Room 204"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-lumin text-primary-foreground"
            >
              Add to schedule
            </Button>
          </div>
        </form>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {DAY_NAMES.map((name, index) => {
            const dayEvents = events.filter((e) => e.day_of_week === index);
            if (dayEvents.length === 0) return null;
            return (
              <section
                key={name}
                className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-panel"
              >
                <h2 className="mb-3 text-sm font-semibold tracking-widest text-muted-foreground uppercase">
                  {name}
                </h2>
                <ul className="space-y-3">
                  {dayEvents.map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(item.start_time)} – {formatTime(item.end_time)} ·{" "}
                          {CATEGORY_LABELS[item.category]}
                          {item.location ? ` · ${item.location}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => void onDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {events.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground md:col-span-2">
              Your week is empty. Add a class or session above.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}