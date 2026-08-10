/**
 * Google Calendar API v3 helper + the translation layer between
 * ClearPath's weekly schedule template (day_of_week + start/end TIME,
 * no concrete date) and Google's date-based events with RRULE recurrence.
 * Server-only.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function getClientId(): string {
  const id = process.env["VITE_GOOGLE_CLIENT_ID"];
  if (!id) throw new Error("VITE_GOOGLE_CLIENT_ID is not configured");
  return id;
}

function getClientSecret(): string {
  const secret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return secret;
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
}

export type GoogleEvent = {
  id: string;
  summary?: string | undefined;
  description?: string | undefined;
  location?: string | undefined;
  start?: { date?: string; dateTime?: string; timeZone?: string } | undefined;
  end?: { date?: string; dateTime?: string; timeZone?: string } | undefined;
  recurrence?: string[] | undefined;
  status?: string | undefined;
};

async function calendarFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "false",
    maxResults: "250",
  });
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  );
  if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items?: GoogleEvent[] };
  return data.items ?? [];
}

export async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  body: Partial<GoogleEvent>,
): Promise<GoogleEvent> {
  const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar insert failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleEvent>;
}

export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: Partial<GoogleEvent>,
): Promise<GoogleEvent> {
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Google Calendar update failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleEvent>;
}

export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  // 410 Gone means it's already deleted on Google's side — treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete failed: ${res.status} ${await res.text()}`);
  }
}

// --- Weekly template <-> RRULE mapping -------------------------------

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export function weeklyRecurrenceRule(dayOfWeek: number): string[] {
  return [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[dayOfWeek]}`];
}

/** If this event has a simple single-day weekly recurrence, return the
 * matching day_of_week (0-6); otherwise null (treat as a one-off event). */
export function parseWeeklyRecurrenceDay(event: GoogleEvent): number | null {
  const rules = event.recurrence ?? [];
  const weekly = rules.find((r) => /FREQ=WEEKLY/.test(r) && !/FREQ=WEEKLY.*FREQ=/.test(r));
  if (!weekly || rules.length !== 1) return null;
  const match = /BYDAY=([A-Z]{2})(?:$|;)/.exec(weekly);
  const code = match?.[1];
  if (!code) return null;
  const idx = BYDAY.indexOf(code as (typeof BYDAY)[number]);
  return idx === -1 ? null : idx;
}

/** Next date (today or later) that falls on the given day_of_week (0=Sun). */
export function nextOccurrenceDate(dayOfWeek: number, from = new Date()): Date {
  const result = new Date(from);
  const diff = (dayOfWeek - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

/** Combine a Date (for y/m/d) with a "HH:MM" TIME string into an ISO
 * dateTime string, keeping it wall-clock (timeZone is sent separately). */
export function toGoogleDateTime(date: Date, time: string): string {
  const parts = time.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function fromGoogleDateTimeToTime(dateTime: string): string {
  const d = new Date(dateTime);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
