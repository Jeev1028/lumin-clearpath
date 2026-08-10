/**
 * Google Classroom API v1 helper. Server-only. Reuses the same OAuth client
 * (VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) as the Google Calendar
 * integration, via a separate connection/token pair so a student can
 * connect either independently.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CLASSROOM_API = "https://classroom.googleapis.com/v1";

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
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export type ClassroomCourse = {
  id: string;
  name: string;
  section?: string;
  room?: string;
  courseState: string;
};

export type ClassroomCourseWork = {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  maxPoints?: number;
  workType?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours?: number; minutes?: number };
  state: string;
};

export type ClassroomSubmission = {
  courseWorkId: string;
  assignedGrade?: number;
  state: string;
};

export type ClassroomAnnouncement = {
  id: string;
  courseId: string;
  text: string;
  creationTime: string;
};

export type ClassroomMaterial = {
  driveFile?: { driveFile?: { title?: string; alternateLink?: string } };
  link?: { url?: string; title?: string };
  youTubeVideo?: { title?: string; alternateLink?: string };
  form?: { title?: string; formUrl?: string };
};

export type ClassroomCourseWorkMaterial = {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  materials?: ClassroomMaterial[];
  creationTime: string;
};

async function classroomFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${CLASSROOM_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Classroom API error (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Paginates through every page of a Classroom list endpoint. */
async function classroomFetchAllPages<T>(
  accessToken: string,
  basePath: string,
  listKey: string,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const sep = basePath.includes("?") ? "&" : "?";
    const path = pageToken ? `${basePath}${sep}pageToken=${pageToken}` : basePath;
    const data = await classroomFetch<Record<string, unknown>>(accessToken, path);
    const pageItems = (data[listKey] as T[] | undefined) ?? [];
    items.push(...pageItems);
    pageToken = data["nextPageToken"] as string | undefined;
  } while (pageToken);
  return items;
}

export async function listMyCourses(accessToken: string): Promise<ClassroomCourse[]> {
  return classroomFetchAllPages<ClassroomCourse>(
    accessToken,
    "/courses?studentId=me&courseStates=ACTIVE",
    "courses",
  );
}

export async function listCourseWork(
  accessToken: string,
  courseId: string,
): Promise<ClassroomCourseWork[]> {
  return classroomFetchAllPages<ClassroomCourseWork>(
    accessToken,
    `/courses/${courseId}/courseWork?courseWorkStates=PUBLISHED`,
    "courseWork",
  );
}

/** All of "my" submissions across every coursework item in a course, in one
 * paginated call (courseWorkId=- is a documented wildcard). */
export async function listMySubmissions(
  accessToken: string,
  courseId: string,
): Promise<ClassroomSubmission[]> {
  return classroomFetchAllPages<ClassroomSubmission>(
    accessToken,
    `/courses/${courseId}/courseWork/-/studentSubmissions?userId=me`,
    "studentSubmissions",
  );
}

export async function listAnnouncements(
  accessToken: string,
  courseId: string,
): Promise<ClassroomAnnouncement[]> {
  return classroomFetchAllPages<ClassroomAnnouncement>(
    accessToken,
    `/courses/${courseId}/announcements?announcementStates=PUBLISHED`,
    "announcements",
  );
}

export async function listCourseWorkMaterials(
  accessToken: string,
  courseId: string,
): Promise<ClassroomCourseWorkMaterial[]> {
  return classroomFetchAllPages<ClassroomCourseWorkMaterial>(
    accessToken,
    `/courses/${courseId}/courseWorkMaterials?courseWorkMaterialStates=PUBLISHED`,
    "courseWorkMaterial",
  );
}

/** Classroom's dueDate/dueTime are separate structured fields -- combine
 * into a single "YYYY-MM-DD" date string matching how ClearPath's own
 * tasks.due_date column is stored (date-only, no time-of-day tracking). */
export function courseWorkDueDate(work: ClassroomCourseWork): string | null {
  if (!work.dueDate) return null;
  const { year, month, day } = work.dueDate;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}
