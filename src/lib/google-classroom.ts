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
  materials?: ClassroomMaterial[];
  // Direct link to this assignment inside real Google Classroom -- kept as
  // a guaranteed-working fallback for turning work in, since some school
  // Google Workspace domains block third-party apps from calling the
  // Classroom API's write endpoints even with the right OAuth scope
  // granted (a domain-level admin restriction, not something this app can
  // work around).
  alternateLink?: string;
};

export type ClassroomSubmission = {
  id: string;
  courseWorkId: string;
  assignedGrade?: number;
  state: string;
  // Present when the assignment used Classroom's "make a copy for each
  // student" option -- these are the student's own individual file
  // copies, distinct from the shared/master materials on the courseWork
  // itself (which a student generally can't or shouldn't edit directly).
  assignmentSubmission?: { attachments?: ClassroomMaterial[] };
};

export type ClassroomAnnouncement = {
  id: string;
  courseId: string;
  text: string;
  creationTime: string;
};

type DriveFileFields = { title?: string; alternateLink?: string; thumbnailUrl?: string };

export type ClassroomMaterial = {
  // Classroom's API returns two DIFFERENT shapes for a Drive file depending
  // on where it came from: a shared "Material" (courseWork.materials[] /
  // courseWorkMaterials) wraps it one level deeper as
  // { driveFile: { driveFile: {...} } }, while a student's own submission
  // attachment (assignmentSubmission.attachments[]) has the fields
  // directly on driveFile with no extra wrapper. Both are handled below
  // since ClearPath shows both kinds of "material" through this same
  // summarizeMaterial() helper -- only checking the wrapped shape silently
  // dropped every "make a copy for each student" attachment.
  driveFile?: { driveFile?: DriveFileFields } & Partial<DriveFileFields>;
  link?: { url?: string; title?: string; thumbnailUrl?: string };
  youTubeVideo?: { title?: string; alternateLink?: string; thumbnailUrl?: string };
  form?: { title?: string; formUrl?: string; thumbnailUrl?: string };
};

export type MaterialType = "driveFile" | "link" | "youTubeVideo" | "form";

export type MaterialSummary = {
  title: string;
  url: string | null;
  thumbnailUrl?: string | null;
  type?: MaterialType;
};

/** Flattens Classroom's discriminated-union material shape into a simple
 * {title, url, thumbnailUrl, type} the UI can render without caring which
 * attachment type it is. Classroom's API returns a thumbnailUrl for every
 * material type directly -- no separate Drive API call or scope needed to
 * show a real preview like Classroom's own UI does. */
export function summarizeMaterial(material: ClassroomMaterial): MaterialSummary | null {
  if (material.driveFile) {
    const df = material.driveFile.driveFile ?? material.driveFile;
    return {
      title: df.title ?? "Drive file",
      url: df.alternateLink ?? null,
      thumbnailUrl: df.thumbnailUrl ?? null,
      type: "driveFile",
    };
  }
  if (material.link) {
    return {
      title: material.link.title ?? material.link.url ?? "Link",
      url: material.link.url ?? null,
      thumbnailUrl: material.link.thumbnailUrl ?? null,
      type: "link",
    };
  }
  if (material.youTubeVideo) {
    return {
      title: material.youTubeVideo.title ?? "YouTube video",
      url: material.youTubeVideo.alternateLink ?? null,
      thumbnailUrl: material.youTubeVideo.thumbnailUrl ?? null,
      type: "youTubeVideo",
    };
  }
  if (material.form) {
    return {
      title: material.form.title ?? "Form",
      url: material.form.formUrl ?? null,
      thumbnailUrl: material.form.thumbnailUrl ?? null,
      type: "form",
    };
  }
  return null;
}

export type ClassroomTeacher = {
  userId: string;
  profile?: { name?: { fullName?: string }; emailAddress?: string };
};

export type ClassroomRubricCriterion = {
  title?: string;
  levels?: { title?: string; points?: number; description?: string }[];
};

export type ClassroomRubric = {
  id: string;
  criteria?: ClassroomRubricCriterion[];
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

/** The teachers of a course, with their profile (including email if the
 * classroom.profile.emails scope was granted). Used only to relay a
 * student's private note to the teacher by real email -- the Classroom API
 * has no comment/messaging endpoint of its own. */
export async function listTeachers(
  accessToken: string,
  courseId: string,
): Promise<ClassroomTeacher[]> {
  return classroomFetchAllPages<ClassroomTeacher>(accessToken, `/courses/${courseId}/teachers`, "teachers");
}

/** Rubrics are a newer, not-universally-enabled Classroom feature -- returns
 * an empty array rather than throwing if the endpoint 404s for a course
 * that doesn't have rubrics turned on for this item. */
export async function listRubrics(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
): Promise<ClassroomRubric[]> {
  try {
    return await classroomFetchAllPages<ClassroomRubric>(
      accessToken,
      `/courses/${courseId}/courseWork/${courseWorkId}/rubrics`,
      "rubrics",
    );
  } catch {
    return [];
  }
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

/** The current student's single submission for one specific coursework
 * item (needed to get its unique submission id, which is required by the
 * turnIn/reclaim actions and is different from the courseWork's own id). */
export async function getMySubmission(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
): Promise<ClassroomSubmission | null> {
  const results = await classroomFetchAllPages<ClassroomSubmission>(
    accessToken,
    `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=me`,
    "studentSubmissions",
  );
  return results[0] ?? null;
}

async function classroomPost(
  accessToken: string,
  path: string,
): Promise<void> {
  const res = await fetch(`${CLASSROOM_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`Classroom API error (${res.status}): ${await res.text()}`);
}

/** Turns in the student's own submission -- equivalent to clicking "Turn
 * in" inside Google Classroom. Whatever is already attached (including a
 * "make a copy for each student" file already linked to the submission)
 * is what gets submitted; ClearPath does not add new attachments. */
export async function turnInSubmission(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
): Promise<void> {
  await classroomPost(
    accessToken,
    `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:turnIn`,
  );
}

/** Undoes a turn-in ("reclaim" in Classroom's own terminology), putting the
 * submission back into a state the student can edit again. */
export async function reclaimSubmission(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
): Promise<void> {
  await classroomPost(
    accessToken,
    `/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:reclaim`,
  );
}

/** Attaches a link (or an existing Drive file the student owns/has access
 * to) to the student's own submission -- the same action as clicking "Add
 * attachment" inside Google Classroom's assignment view. Uses the same
 * classroom.coursework.me scope as turnIn/reclaim, no extra Drive scope
 * needed for links. */
export async function addSubmissionLink(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
  url: string,
): Promise<void> {
  const res = await fetch(
    `${CLASSROOM_API}/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:modifyAttachments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addAttachments: [{ link: { url } }] }),
    },
  );
  if (!res.ok) throw new Error(`Classroom API error (${res.status}): ${await res.text()}`);
}

/** Attaches an existing Drive file (picked via the Google Picker widget, or
 * just uploaded through it) to the student's own submission, as a real
 * Drive attachment rather than a plain link -- matching what "Add
 * attachment > Google Drive" does inside Classroom itself. */
export async function addSubmissionDriveFile(
  accessToken: string,
  courseId: string,
  courseWorkId: string,
  submissionId: string,
  driveFileId: string,
): Promise<void> {
  const res = await fetch(
    `${CLASSROOM_API}/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submissionId}:modifyAttachments`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addAttachments: [{ driveFile: { id: driveFileId } }] }),
    },
  );
  if (!res.ok) throw new Error(`Classroom API error (${res.status}): ${await res.text()}`);
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
