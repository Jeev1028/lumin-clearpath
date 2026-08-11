import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Copy, Download, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { StudyPlanner } from "@/components/lumin/StudyPlanner";
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
import { buildIcs, downloadIcs } from "@/lib/ics";
import { undoableDelete } from "@/lib/undoable-delete";
import {
  CATEGORY_LABELS,
  DAY_NAMES,
  type CalendarConnection,
  type CalendarEvent,
  type ScheduleCategory,
  type ScheduleEvent,
  createCalendarEvent,
  createEvent,
  deleteCalendarEvent,
  deleteEvent,
  formatTime,
  getCalendarConnection,
  listCalendarEvents,
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

const emptyOneOffDraft = {
  title: "",
  date: "",
  start_time: "09:00",
  end_time: "10:00",
};

function SchedulePage() {
  const navigate = useNavigate();
  const { session, user, loading, needsMfa } = useAuth();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [oneOffEvents, setOneOffEvents] = useState<CalendarEvent[]>([]);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [oneOffDraft, setOneOffDraft] = useState(emptyOneOffDraft);
  const [busy, setBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const [subscribeBusy, setSubscribeBusy] = useState(false);

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
    Promise.all([listEvents(), listCalendarEvents(), getCalendarConnection()])
      .then(([scheduleData, oneOffData, connectionData]) => {
        setEvents(scheduleData);
        setOneOffEvents(oneOffData);
        setConnection(connectionData);
        // Already connected — keep it fresh automatically on every visit,
        // without needing a manual "Sync now" click.
        if (connectionData) void handleSync({ silent: true });
      })
      .catch(() => toast.error("Could not load your schedule."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, needsMfa, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar");
    if (!status) return;
    if (status === "connected") toast.success("Google Calendar connected!");
    else if (status === "denied") toast.error("Google Calendar connection was cancelled.");
    else toast.error("Could not connect Google Calendar. Please try again.");
    params.delete("calendar");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

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
          (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
        ),
      );
      setDraft({ ...emptyDraft, category: draft.category });
    } catch {
      toast.error("Could not save that class.");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(id: string) {
    const item = events.find((e) => e.id === id);
    if (!item) return;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    undoableDelete({
      label: `Deleted "${item.title}"`,
      onCommit: async () => {
        try {
          await deleteEvent(id);
        } catch {
          toast.error("Could not remove that class.");
        }
      },
      onUndo: () =>
        setEvents((prev) =>
          [...prev, item].sort(
            (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
          ),
        ),
    });
  }

  async function onAddOneOff(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !oneOffDraft.title.trim() || !oneOffDraft.date) return;
    setBusy(true);
    try {
      const [year, month, day] = oneOffDraft.date.split("-").map(Number);
      const [startH, startM] = oneOffDraft.start_time.split(":").map(Number);
      const [endH, endM] = oneOffDraft.end_time.split(":").map(Number);
      const startAt = new Date(year!, (month ?? 1) - 1, day, startH, startM).toISOString();
      const endAt = new Date(year!, (month ?? 1) - 1, day, endH, endM).toISOString();
      const created = await createCalendarEvent(user.id, {
        title: oneOffDraft.title.trim(),
        start_at: startAt,
        end_at: endAt,
      });
      setOneOffEvents((prev) =>
        [...prev, created].sort((a, b) => a.start_at.localeCompare(b.start_at)),
      );
      setOneOffDraft(emptyOneOffDraft);
    } catch {
      toast.error("Could not save that event.");
    } finally {
      setBusy(false);
    }
  }

  function onDeleteOneOff(id: string) {
    const item = oneOffEvents.find((e) => e.id === id);
    if (!item) return;
    setOneOffEvents((prev) => prev.filter((e) => e.id !== id));
    undoableDelete({
      label: `Deleted "${item.title}"`,
      onCommit: async () => {
        try {
          await deleteCalendarEvent(id);
        } catch {
          toast.error("Could not remove that event.");
        }
      },
      onUndo: () =>
        setOneOffEvents((prev) => [...prev, item].sort((a, b) => a.start_at.localeCompare(b.start_at))),
    });
  }

  async function handleConnect() {
    if (!session) return;
    setCalendarBusy(true);
    try {
      const res = await fetch("/api/google-calendar/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      toast.error("Could not start the Google Calendar connection.");
      setCalendarBusy(false);
    }
  }

  async function handleSync(options?: { silent?: boolean }) {
    if (!session) return;
    setCalendarBusy(true);
    setSyncing(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/google-calendar/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timeZone }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { pushed: number; pulled: number };
      const [freshEvents, freshOneOff, freshConnection] = await Promise.all([
        listEvents(),
        listCalendarEvents(),
        getCalendarConnection(),
      ]);
      setEvents(freshEvents);
      setOneOffEvents(freshOneOff);
      setConnection(freshConnection);
      if (!options?.silent) {
        toast.success(`Synced — ${result.pushed} sent, ${result.pulled} new from Google.`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Sync failed — please try again.",
      );
    } finally {
      setCalendarBusy(false);
      setSyncing(false);
    }
  }

  function handleExportIcs() {
    const contents = buildIcs(events, oneOffEvents);
    downloadIcs("clearpath-schedule.ics", contents);
    toast.success("Calendar exported.");
  }

  async function handleGetSubscribeLink() {
    if (!session) return;
    setSubscribeBusy(true);
    try {
      const res = await fetch("/api/calendar-feed/link", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error();
      const { webcalUrl } = (await res.json()) as { webcalUrl: string; httpsUrl: string };
      setSubscribeUrl(webcalUrl);
    } catch {
      toast.error("Could not create a subscription link.");
    } finally {
      setSubscribeBusy(false);
    }
  }

  async function handleCopySubscribeLink() {
    if (!subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy — select and copy the link manually.");
    }
  }

  async function handleDisconnect() {
    if (!session) return;
    setCalendarBusy(true);
    try {
      await fetch("/api/google-calendar/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setConnection(null);
      toast.success("Google Calendar disconnected.");
    } catch {
      toast.error("Could not disconnect.");
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Class schedule</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Weekday classes, weekend sessions, extracurriculars and holiday learning — one week at
          a glance.
        </p>

        <div className="mt-6">
          <StudyPlanner />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <CalendarClock className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">Google Calendar</p>
              <p className="text-xs text-muted-foreground">
                {connection
                  ? connection.last_synced_at
                    ? `Connected · last synced ${new Date(connection.last_synced_at).toLocaleString()}`
                    : "Connected · not yet synced"
                  : "Two-way sync with your Google Calendar, optional."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {connection ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={calendarBusy}
                  onClick={() => void handleSync()}
                  className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={calendarBusy}
                  onClick={() => void handleDisconnect()}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={calendarBusy}
                onClick={() => void handleConnect()}
                className="bg-gradient-lumin text-primary-foreground"
              >
                Connect Google Calendar
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Download className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">Export calendar</p>
              <p className="text-xs text-muted-foreground">
                Download a .ics file to import into Apple Calendar, Outlook, or any other calendar
                app — no Google account needed.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportIcs}
            className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export .ics
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <CalendarClock className="h-5 w-5 text-accent" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold">Subscribe from Apple Calendar, Outlook, etc.</p>
                <p className="text-xs text-muted-foreground">
                  A live link that keeps updating automatically — unlike Export, you only set this
                  up once.
                </p>
              </div>
            </div>
            {!subscribeUrl && (
              <Button
                size="sm"
                variant="outline"
                disabled={subscribeBusy}
                onClick={() => void handleGetSubscribeLink()}
                className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
              >
                {subscribeBusy ? "Creating…" : "Get subscription link"}
              </Button>
            )}
          </div>
          {subscribeUrl && (
            <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
                  {subscribeUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopySubscribeLink()}
                  className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Apple Calendar:</strong> tap the link on your iPhone/Mac and it opens
                automatically, or in the Calendar app go to File → New Calendar Subscription and
                paste it in.{" "}
                <strong>Outlook/Google Calendar:</strong> use "Add calendar → From URL" and paste
                the link (swap <code>webcal://</code> for <code>https://</code> if asked for a
                plain URL). Keep this link private — anyone with it can see your schedule.
              </p>
            </div>
          )}
        </div>

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

        <h2 className="mt-12 text-xl font-semibold">Upcoming events</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One-off events like appointments — added here, or pulled in from Google Calendar.
        </p>

        <form
          onSubmit={onAddOneOff}
          className="mt-4 grid gap-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel sm:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="oneoff-title">Event</Label>
            <Input
              id="oneoff-title"
              value={oneOffDraft.title}
              onChange={(e) => setOneOffDraft({ ...oneOffDraft, title: e.target.value })}
              placeholder="Dentist appointment"
              required
            />
          </div>
          <div>
            <Label htmlFor="oneoff-date">Date</Label>
            <Input
              id="oneoff-date"
              type="date"
              value={oneOffDraft.date}
              onChange={(e) => setOneOffDraft({ ...oneOffDraft, date: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="oneoff-start">Starts</Label>
              <Input
                id="oneoff-start"
                type="time"
                value={oneOffDraft.start_time}
                onChange={(e) => setOneOffDraft({ ...oneOffDraft, start_time: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="oneoff-end">Ends</Label>
              <Input
                id="oneoff-end"
                type="time"
                value={oneOffDraft.end_time}
                onChange={(e) => setOneOffDraft({ ...oneOffDraft, end_time: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-end sm:col-span-4">
            <Button
              type="submit"
              disabled={busy}
              className="bg-gradient-lumin text-primary-foreground"
            >
              Add event
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {oneOffEvents.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.start_at).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {item.location ? ` · ${item.location}` : ""}
                  {item.source === "google" ? " · from Google Calendar" : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${item.title}`}
                onClick={() => void onDeleteOneOff(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {oneOffEvents.length === 0 && (
            <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
              No upcoming one-off events.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
