import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "@/lib/api-auth";
import type { CalendarEvent, ScheduleEvent, Task } from "@/lib/clearpath";
import { buildIcs } from "@/lib/ics";
import { verifySignedState } from "@/lib/oauth-state";

// A calendar subscription URL is fetched directly by Apple/Google/Outlook's
// own calendar apps on a recurring schedule -- there's no browser session or
// Authorization header available, so access is controlled entirely by
// possession of this long-lived signed token instead (same pattern as the
// teacher portal). ~10 years is effectively "never expires" for a personal
// calendar subscription; if it ever needs to be revoked, regenerating
// OAUTH_STATE_SECRET would invalidate every token app-wide, which is a
// last-resort option, not a normal one.
const FEED_TOKEN_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/calendar-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const payload = token ? verifySignedState(token, FEED_TOKEN_MAX_AGE_MS) : null;
        const userId = payload?.["userId"];
        if (!userId) return new Response("This calendar link is invalid or has expired.", { status: 401 });

        const admin = getAdminClient();
        const [scheduleRes, calendarRes, tasksRes] = await Promise.all([
          admin
            .from("schedule_events")
            .select("id, title, category, day_of_week, start_time, end_time, location")
            .eq("user_id", userId)
            .returns<ScheduleEvent[]>(),
          admin
            .from("calendar_events")
            .select("id, title, description, location, start_at, end_at, all_day, source, google_event_id")
            .eq("user_id", userId)
            .returns<CalendarEvent[]>(),
          admin
            .from("tasks")
            .select("id, title, course, due_date")
            .eq("user_id", userId)
            .returns<Pick<Task, "id" | "title" | "course" | "due_date">[]>(),
        ]);

        const contents = buildIcs(
          scheduleRes.data ?? [],
          calendarRes.data ?? [],
          tasksRes.data ?? [],
        );

        return new Response(contents, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'inline; filename="clearpath.ics"',
            // Calendar apps typically poll every few hours regardless, but
            // this discourages any aggressive intermediate caching.
            "Cache-Control": "no-cache, max-age=0",
          },
        });
      },
    },
  },
});
