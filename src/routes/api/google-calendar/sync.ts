import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import {
  fromGoogleDateTimeToTime,
  insertGoogleEvent,
  listGoogleEvents,
  nextOccurrenceDate,
  parseWeeklyRecurrenceDay,
  refreshAccessToken,
  toGoogleDateTime,
  updateGoogleEvent,
  weeklyRecurrenceRule,
  type GoogleEvent,
} from "@/lib/google-calendar";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

type SyncBody = { timeZone?: string };

export const Route = createFileRoute("/api/google-calendar/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, supabase } = auth;

        const body = (await request.json().catch(() => ({}))) as SyncBody;
        const timeZone = body.timeZone || "UTC";

        const admin = getAdminClient();
        const { data: connection, error: connError } = await admin
          .from("google_calendar_connections")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (connError) return new Response("Could not load connection", { status: 500 });
        if (!connection) return new Response("Google Calendar is not connected", { status: 400 });

        // Refresh the access token if it's missing or expiring soon.
        let accessToken = connection.access_token_encrypted
          ? decryptToken(connection.access_token_encrypted)
          : null;
        const expiresAt = connection.access_token_expires_at
          ? new Date(connection.access_token_expires_at).getTime()
          : 0;
        if (!accessToken || expiresAt - Date.now() < 60_000) {
          try {
            const refreshToken = decryptToken(connection.refresh_token_encrypted);
            const refreshed = await refreshAccessToken(refreshToken);
            accessToken = refreshed.access_token;
            await admin
              .from("google_calendar_connections")
              .update({
                access_token_encrypted: encryptToken(accessToken),
                access_token_expires_at: new Date(
                  Date.now() + refreshed.expires_in * 1000,
                ).toISOString(),
              })
              .eq("user_id", userId);
          } catch (err) {
            console.error("[google-calendar] token refresh failed", err);
            return new Response(
              "Google Calendar access has expired — please reconnect it.",
              { status: 409 },
            );
          }
        }

        const calendarId = connection.google_calendar_id;
        let pushed = 0;
        let pulled = 0;

        try {
          // ---- PUSH: weekly template (schedule_events) ----
          const { data: scheduleRows } = await supabase.from("schedule_events").select("*");
          for (const row of scheduleRows ?? []) {
            const dtStartDate = nextOccurrenceDate(row.day_of_week);
            const eventBody: Partial<GoogleEvent> = {
              summary: row.title,
              location: row.location ?? undefined,
              start: {
                dateTime: toGoogleDateTime(dtStartDate, row.start_time.slice(0, 5)),
                timeZone,
              },
              end: {
                dateTime: toGoogleDateTime(dtStartDate, row.end_time.slice(0, 5)),
                timeZone,
              },
              recurrence: weeklyRecurrenceRule(row.day_of_week),
            };
            if (row.google_event_id) {
              await updateGoogleEvent(accessToken!, calendarId, row.google_event_id, eventBody);
            } else {
              const created = await insertGoogleEvent(accessToken!, calendarId, eventBody);
              await supabase
                .from("schedule_events")
                .update({ google_event_id: created.id })
                .eq("id", row.id);
            }
            pushed++;
          }

          // ---- PUSH: one-off ClearPath-created events (calendar_events) ----
          const { data: oneOffRows } = await supabase
            .from("calendar_events")
            .select("*")
            .eq("source", "clearpath");
          for (const row of oneOffRows ?? []) {
            const eventBody: Partial<GoogleEvent> = {
              summary: row.title,
              description: row.description ?? undefined,
              location: row.location ?? undefined,
              start: row.all_day
                ? { date: row.start_at.slice(0, 10) }
                : { dateTime: row.start_at, timeZone },
              end: row.all_day
                ? { date: row.end_at.slice(0, 10) }
                : { dateTime: row.end_at, timeZone },
            };
            if (row.google_event_id) {
              await updateGoogleEvent(accessToken!, calendarId, row.google_event_id, eventBody);
            } else {
              const created = await insertGoogleEvent(accessToken!, calendarId, eventBody);
              await supabase
                .from("calendar_events")
                .update({ google_event_id: created.id })
                .eq("id", row.id);
            }
            pushed++;
          }

          // ---- PULL: bring in events we don't already know about ----
          const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
          const googleEvents = await listGoogleEvents(accessToken!, calendarId, timeMin, timeMax);

          const knownScheduleIds = new Set(
            (scheduleRows ?? []).map((r) => r.google_event_id).filter(Boolean),
          );
          const knownOneOffIds = new Set(
            (oneOffRows ?? []).map((r) => r.google_event_id).filter(Boolean),
          );

          for (const event of googleEvents) {
            if (event.status === "cancelled") continue;
            if (knownScheduleIds.has(event.id) || knownOneOffIds.has(event.id)) continue;

            const weeklyDay = parseWeeklyRecurrenceDay(event);
            if (weeklyDay !== null && event.start?.dateTime && event.end?.dateTime) {
              await supabase.from("schedule_events").insert({
                user_id: userId,
                title: event.summary || "Untitled",
                category: weeklyDay === 0 || weeklyDay === 6 ? "weekend" : "weekday",
                day_of_week: weeklyDay,
                start_time: fromGoogleDateTimeToTime(event.start.dateTime),
                end_time: fromGoogleDateTimeToTime(event.end.dateTime),
                location: event.location ?? null,
                google_event_id: event.id,
              });
              pulled++;
            } else if (!event.recurrence?.length) {
              const allDay = Boolean(event.start?.date);
              const startAt = allDay
                ? `${event.start!.date}T00:00:00.000Z`
                : event.start?.dateTime;
              const endAt = allDay ? `${event.end!.date}T00:00:00.000Z` : event.end?.dateTime;
              if (!startAt || !endAt) continue;
              await supabase.from("calendar_events").insert({
                user_id: userId,
                title: event.summary || "Untitled",
                description: event.description ?? null,
                location: event.location ?? null,
                start_at: startAt,
                end_at: endAt,
                all_day: allDay,
                source: "google",
                google_event_id: event.id,
              });
              pulled++;
            }
          }

          await admin
            .from("google_calendar_connections")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("user_id", userId);

          return Response.json({ pushed, pulled });
        } catch (err) {
          console.error("[google-calendar] sync failed", err);
          return new Response("Sync failed", { status: 500 });
        }
      },
    },
  },
});
