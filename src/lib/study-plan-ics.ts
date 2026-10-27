// Turns the AI's markdown study plan ("### Monday, Oct 26" headings with
// "- 5:00-6:30pm — Chemistry: ..." bullets) into dated, timed blocks that can
// be written to a calendar file.

export type PlanBlock = {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Minutes after local midnight. */
  startMin: number;
  /** Minutes after local midnight; can exceed 1440 when a block runs past midnight. */
  endMin: number;
  title: string;
  /** Position within the plan, so each block gets a stable calendar id. */
  index: number;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const RANGE_RE =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(.*)$/i;
const DATE_IN_HEADING_RE = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/;
const HORIZON_RE = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/;

/** Plans are saved with their date range ("2026-10-27/2026-11-09"). Older
 * plans saved "week", "month" or a day count instead, so this can be null. */
export function parseHorizonRange(horizon: string): { start: string; end: string } | null {
  const match = HORIZON_RE.exec(horizon);
  return match ? { start: match[1]!, end: match[2]! } : null;
}

/** The first day of the plan, used to work out which year a heading belongs to. */
export function planStartDate(horizon: string, generatedAt: string): string {
  return parseHorizonRange(horizon)?.start ?? generatedAt.slice(0, 10);
}

function to24h(hour: number, meridiem: string): number {
  return (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
}

function plain(text: string): string {
  return text
    .replace(/\*+/g, "")
    .replace(/`/g, "")
    .replace(/^[\s—–:-]+/, "")
    .trim();
}

export function parsePlanBlocks(markdown: string, startDate: string): PlanBlock[] {
  const [startYear = 1970, startMonth = 1] = startDate.split("-").map(Number);
  const blocks: PlanBlock[] = [];
  let currentDate: string | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (/^#{2,4}\s/.test(line)) {
      currentDate = null;
      const match = DATE_IN_HEADING_RE.exec(line.replace(/^#+\s*/, ""));
      if (!match) continue;
      const month = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase());
      const day = Number(match[2]);
      if (month < 0 || day < 1 || day > 31) continue;
      // A plan that runs from December into January crosses a year.
      const year = month + 1 < startMonth ? startYear + 1 : startYear;
      currentDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      continue;
    }

    if (!currentDate || !/^[-*•]\s/.test(line)) continue;
    const body = line.replace(/^[-*•]\s+/, "").replace(/\*+/g, "");
    const match = RANGE_RE.exec(body);
    if (!match) continue;

    const endHour = Number(match[4]);
    const endMeridiem = match[6]!;
    const endMin = to24h(endHour, endMeridiem) * 60 + Number(match[5] ?? 0);

    const startHour = Number(match[1]);
    const startMinutes = Number(match[2] ?? 0);
    let startMin: number;
    if (match[3]) {
      startMin = to24h(startHour, match[3]) * 60 + startMinutes;
    } else {
      // "11:00-1:00pm": the start has no am/pm, so pick the one that makes sense.
      startMin = to24h(startHour, endMeridiem) * 60 + startMinutes;
      if (startMin >= endMin) {
        const other = endMeridiem.toLowerCase() === "pm" ? "am" : "pm";
        startMin = to24h(startHour, other) * 60 + startMinutes;
      }
    }

    // "9:00pm-12:00am" ends after midnight.
    const adjustedEnd = endMin <= startMin ? endMin + 1440 : endMin;
    const title = plain(match[7] ?? "");
    if (!title) continue;

    blocks.push({
      date: currentDate,
      startMin,
      endMin: adjustedEnd,
      title: title.slice(0, 200),
      index: blocks.length,
    });
  }

  return blocks;
}
