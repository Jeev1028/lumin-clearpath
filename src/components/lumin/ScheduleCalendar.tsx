import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  DAY_NAMES,
  type CalendarEvent,
  type ScheduleEvent,
  formatTime,
} from "@/lib/clearpath";
import { cn } from "@/lib/utils";

type View = "day" | "week" | "month" | "year";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** One thing happening on one specific date. Weekly classes repeat, so the
 * same class produces one item per matching date; one-off events produce one. */
type Item = {
  key: string;
  /** Row id to delete: the class (every week) or the one-off event. */
  id: string;
  kind: "weekly" | "oneoff";
  title: string;
  startMin: number;
  allDay: boolean;
  timeLabel: string;
  detail: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

function clockLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekStart(date: Date): Date {
  return addDays(startOfDay(date), -date.getDay());
}

export function ScheduleCalendar({
  events,
  oneOffEvents,
  onDeleteWeekly,
  onDeleteOneOff,
}: {
  events: ScheduleEvent[];
  oneOffEvents: CalendarEvent[];
  onDeleteWeekly: (id: string) => void;
  onDeleteOneOff: (id: string) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const todayKey = dateKey(new Date());

  // One-off events grouped by local date so each day lookup is cheap.
  const oneOffByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of oneOffEvents) {
      const key = dateKey(new Date(event.start_at));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [oneOffEvents]);

  const weeklyByDay = useMemo(() => {
    const map = new Map<number, ScheduleEvent[]>();
    for (const event of events) {
      const list = map.get(event.day_of_week) ?? [];
      list.push(event);
      map.set(event.day_of_week, list);
    }
    return map;
  }, [events]);

  function itemsOn(date: Date): Item[] {
    const key = dateKey(date);
    const items: Item[] = [];
    for (const e of weeklyByDay.get(date.getDay()) ?? []) {
      items.push({
        key: `w-${e.id}-${key}`,
        id: e.id,
        kind: "weekly",
        title: e.title,
        startMin: minutesOf(e.start_time),
        allDay: false,
        timeLabel: `${formatTime(e.start_time)} – ${formatTime(e.end_time)}`,
        detail: `${CATEGORY_LABELS[e.category]} · repeats every ${DAY_NAMES[e.day_of_week]}${
          e.location ? ` · ${e.location}` : ""
        }`,
      });
    }
    for (const e of oneOffByDate.get(key) ?? []) {
      const start = new Date(e.start_at);
      const end = new Date(e.end_at);
      items.push({
        key: `o-${e.id}`,
        id: e.id,
        kind: "oneoff",
        title: e.title,
        startMin: e.all_day ? -1 : start.getHours() * 60 + start.getMinutes(),
        allDay: e.all_day,
        timeLabel: e.all_day ? "All day" : `${clockLabel(start)} – ${clockLabel(end)}`,
        detail: `${e.source === "google" ? "From Google Calendar" : "One-off event"}${
          e.location ? ` · ${e.location}` : ""
        }`,
      });
    }
    return items.sort((a, b) => a.startMin - b.startMin || a.title.localeCompare(b.title));
  }

  function shift(direction: -1 | 1) {
    setCursor((current) => {
      if (view === "day") return addDays(current, direction);
      if (view === "week") return addDays(current, direction * 7);
      if (view === "month")
        return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      return new Date(current.getFullYear() + direction, 0, 1);
    });
  }

  function openDay(date: Date) {
    setCursor(startOfDay(date));
    setView("day");
  }

  const title = (() => {
    if (view === "day") {
      return cursor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const first = weekStart(cursor);
      const last = addDays(first, 6);
      const sameMonth = first.getMonth() === last.getMonth();
      const left = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const right = last.toLocaleDateString(undefined, {
        month: sameMonth ? undefined : "short",
        day: "numeric",
        year: "numeric",
      });
      return `${left} – ${right}`;
    }
    if (view === "month") return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
    return String(cursor.getFullYear());
  })();

  return (
    <section
      aria-label="Calendar"
      className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-panel sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCursor(startOfDay(new Date()))}
            className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
          >
            Today
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Previous"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Next"
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-1 text-lg font-semibold">{title}</h2>
        </div>
        <div className="inline-flex rounded-full border border-border/60 bg-background/40 p-0.5">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              aria-pressed={view === option.id}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                view === option.id
                  ? "bg-accent/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {view === "day" && (
          <DayView
            items={itemsOn(cursor)}
            onDelete={(item) =>
              item.kind === "weekly" ? onDeleteWeekly(item.id) : onDeleteOneOff(item.id)
            }
          />
        )}

        {view === "week" && (
          <div className="grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)).map((day) => {
              const items = itemsOn(day);
              const isToday = dateKey(day) === todayKey;
              return (
                <div
                  key={dateKey(day)}
                  className={cn(
                    "min-h-28 rounded-xl border p-2",
                    isToday ? "border-accent/60 bg-accent/5" : "border-border/60 bg-background/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openDay(day)}
                    className="mb-2 flex w-full items-baseline justify-between text-left"
                  >
                    <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                      {DAY_NAMES[day.getDay()]!.slice(0, 3)}
                    </span>
                    <span className={cn("text-sm font-semibold", isToday && "text-accent")}>
                      {day.getDate()}
                    </span>
                  </button>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <li
                        key={item.key}
                        className={cn(
                          "rounded-lg border-l-2 px-2 py-1 text-xs",
                          item.kind === "weekly"
                            ? "border-accent bg-accent/10"
                            : "border-amber-400 bg-amber-400/10",
                        )}
                      >
                        <p className="font-medium break-words">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.allDay ? "All day" : item.timeLabel.split(" – ")[0]}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {view === "month" && (
          <MonthGrid cursor={cursor} todayKey={todayKey} itemsOn={itemsOn} onOpenDay={openDay} />
        )}

        {view === "year" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }, (_, month) => (
              <MiniMonth
                key={month}
                year={cursor.getFullYear()}
                month={month}
                todayKey={todayKey}
                hasItems={(date) => itemsOn(date).length > 0}
                onOpenDay={openDay}
                onOpenMonth={() => {
                  setCursor(new Date(cursor.getFullYear(), month, 1));
                  setView("month");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DayView({ items, onDelete }: { items: Item[]; onDelete: (item: Item) => void }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
        Nothing scheduled this day.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            "flex items-start gap-3 rounded-xl border-l-4 bg-background/40 px-4 py-3",
            item.kind === "weekly" ? "border-accent" : "border-amber-400",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium break-words">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.timeLabel}</p>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              item.kind === "weekly"
                ? `Delete ${item.title} from every week`
                : `Delete ${item.title}`
            }
            title={item.kind === "weekly" ? "Removes this class from every week" : "Delete"}
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

function MonthGrid({
  cursor,
  todayKey,
  itemsOn,
  onOpenDay,
}: {
  cursor: Date;
  todayKey: string;
  itemsOn: (date: Date) => Item[];
  onOpenDay: (date: Date) => void;
}) {
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {DAY_NAMES.map((name) => (
          <p
            key={name}
            className="text-center text-[11px] font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {name.slice(0, 3)}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = dateKey(day) === todayKey;
          const items = itemsOn(day);
          return (
            <button
              key={dateKey(day)}
              type="button"
              onClick={() => onOpenDay(day)}
              className={cn(
                "flex min-h-16 flex-col rounded-lg border p-1 text-left transition-colors hover:border-accent/60 sm:min-h-24 sm:p-1.5",
                isToday ? "border-accent/60 bg-accent/5" : "border-border/50 bg-background/30",
                !inMonth && "opacity-40",
              )}
            >
              <span className={cn("text-xs font-semibold", isToday && "text-accent")}>
                {day.getDate()}
              </span>
              <span className="mt-1 hidden flex-1 space-y-0.5 sm:block">
                {items.slice(0, 3).map((item) => (
                  <span
                    key={item.key}
                    className={cn(
                      "block truncate rounded px-1 text-[10px] leading-4",
                      item.kind === "weekly" ? "bg-accent/15" : "bg-amber-400/15",
                    )}
                  >
                    {item.title}
                  </span>
                ))}
                {items.length > 3 && (
                  <span className="block px-1 text-[10px] text-muted-foreground">
                    +{items.length - 3} more
                  </span>
                )}
              </span>
              {items.length > 0 && (
                <span className="mt-auto flex gap-0.5 sm:hidden" aria-hidden>
                  {items.slice(0, 3).map((item) => (
                    <span key={item.key} className="h-1.5 w-1.5 rounded-full bg-accent" />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({
  year,
  month,
  todayKey,
  hasItems,
  onOpenDay,
  onOpenMonth,
}: {
  year: number;
  month: number;
  todayKey: string;
  hasItems: (date: Date) => boolean;
  onOpenDay: (date: Date) => void;
  onOpenMonth: () => void;
}) {
  const cells = monthCells(year, month);
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-3">
      <button
        type="button"
        onClick={onOpenMonth}
        className="mb-2 text-sm font-semibold hover:text-accent"
      >
        {MONTH_NAMES[month]}
      </button>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
        {DAY_NAMES.map((name) => (
          <span key={name}>{name[0]}</span>
        ))}
        {cells.map((day) => {
          if (day.getMonth() !== month) return <span key={dateKey(day)} />;
          const isToday = dateKey(day) === todayKey;
          const busy = hasItems(day);
          return (
            <button
              key={dateKey(day)}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={day.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              className={cn(
                "rounded py-0.5 text-[11px] hover:bg-accent/20",
                isToday ? "bg-accent text-primary-foreground" : "text-foreground",
                busy && !isToday && "bg-accent/15 font-semibold",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
