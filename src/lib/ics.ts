import type { CalendarEvent, ScheduleEvent } from "@/lib/clearpath";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Next date (today or later) that falls on the given day_of_week (0=Sun). */
function nextOccurrenceDate(dayOfWeek: number, from = new Date()): Date {
  const result = new Date(from);
  const diff = (dayOfWeek - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

/** Floating local date-time (no timezone suffix) — right for recurring
 * weekly template events, where the intent is "every Monday at 9am,
 * whatever my local time is" rather than a fixed UTC instant. */
function floatingDateTime(date: Date, time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** True UTC instant, for one-off events that already have an absolute
 * timestamp — calendar apps will render this in the viewer's local time. */
function utcDateTime(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function dateOnly(isoString: string, addDaysIfSame?: string): string {
  const d = new Date(isoString);
  let y = d.getUTCFullYear();
  let mo = d.getUTCMonth();
  let day = d.getUTCDate();
  if (addDaysIfSame && `${y}${pad(mo + 1)}${pad(day)}` === addDaysIfSame) {
    const bumped = new Date(Date.UTC(y, mo, day + 1));
    y = bumped.getUTCFullYear();
    mo = bumped.getUTCMonth();
    day = bumped.getUTCDate();
  }
  return `${y}${pad(mo + 1)}${pad(day)}`;
}

/** Escapes text per RFC 5545 (backslash, comma, semicolon, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets per RFC 5545 (CRLF + leading space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join("\r\n ");
}

function buildEvent(lines: string[]) {
  return lines.map(foldLine).join("\r\n");
}

export function buildIcs(scheduleEvents: ScheduleEvent[], calendarEvents: CalendarEvent[]): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const vevents: string[] = [];

  for (const event of scheduleEvents) {
    const anchor = nextOccurrenceDate(event.day_of_week);
    const lines = [
      "BEGIN:VEVENT",
      `UID:schedule-${event.id}@luminclearpath.ca`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${floatingDateTime(anchor, event.start_time)}`,
      `DTEND:${floatingDateTime(anchor, event.end_time)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[event.day_of_week]}`,
      `SUMMARY:${escapeText(event.title)}`,
    ];
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
    vevents.push(buildEvent(lines));
  }

  for (const event of calendarEvents) {
    const lines = ["BEGIN:VEVENT", `UID:calendar-${event.id}@luminclearpath.ca`, `DTSTAMP:${stamp}`];
    if (event.all_day) {
      const startDate = dateOnly(event.start_at);
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(event.end_at, startDate)}`);
    } else {
      lines.push(`DTSTART:${utcDateTime(event.start_at)}`);
      lines.push(`DTEND:${utcDateTime(event.end_at)}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
    vevents.push(buildEvent(lines));
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClearPath//Lumin AI//EN",
    "CALSCALE:GREGORIAN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
