import { supabase } from "@/integrations/supabase/client";

export type TaskKind = "test" | "assignment" | "project" | "reading";
export type TaskStatus = "todo" | "in_progress" | "submitted";

export type MaterialItem = { title: string; url: string | null };
export type RubricCriterion = {
  title?: string;
  levels?: { title?: string; points?: number; description?: string }[];
};
export type Rubric = { id: string; criteria?: RubricCriterion[] };

export type Task = {
  id: string;
  title: string;
  course: string | null;
  kind: TaskKind;
  status: TaskStatus;
  due_date: string | null;
  notes: string | null;
  source: string;
  description: string | null;
  materials: MaterialItem[];
  rubric: Rubric | null;
  google_classroom_id: string | null;
  classroom_course_id: string | null;
};

const TASK_FIELDS =
  "id, title, course, kind, status, due_date, notes, source, description, materials, rubric, google_classroom_id, classroom_course_id";

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_FIELDS)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(
  userId: string,
  input: Omit<
    Task,
    "id" | "source" | "description" | "materials" | "rubric" | "google_classroom_id" | "classroom_course_id"
  >,
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...input, user_id: userId, source: "clearpath" })
    .select(TASK_FIELDS)
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export type ScheduleCategory = "weekday" | "weekend" | "extracurricular" | "holiday";

export type ScheduleEvent = {
  id: string;
  title: string;
  category: ScheduleCategory;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
};

const EVENT_FIELDS = "id, title, category, day_of_week, start_time, end_time, location";

export async function listEvents(): Promise<ScheduleEvent[]> {
  const { data, error } = await supabase
    .from("schedule_events")
    .select(EVENT_FIELDS)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduleEvent[];
}

export async function createEvent(
  userId: string,
  input: Omit<ScheduleEvent, "id">,
): Promise<ScheduleEvent> {
  const { data, error } = await supabase
    .from("schedule_events")
    .insert({ ...input, user_id: userId })
    .select(EVENT_FIELDS)
    .single();
  if (error) throw error;
  return data as ScheduleEvent;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("schedule_events").delete().eq("id", id);
  if (error) throw error;
}

// --- One-off dated events (separate from the weekly schedule template) ---

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  source: "clearpath" | "google";
  google_event_id: string | null;
};

const CALENDAR_EVENT_FIELDS =
  "id, title, description, location, start_at, end_at, all_day, source, google_event_id";

export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select(CALENDAR_EVENT_FIELDS)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CalendarEvent[];
}

export async function createCalendarEvent(
  userId: string,
  input: { title: string; start_at: string; end_at: string; location?: string | null },
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...input, user_id: userId, source: "clearpath" })
    .select(CALENDAR_EVENT_FIELDS)
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

// --- Google Calendar connection status ---

export type CalendarConnection = {
  connected_at: string;
  last_synced_at: string | null;
  google_calendar_id: string;
};

export async function getCalendarConnection(): Promise<CalendarConnection | null> {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("connected_at, last_synced_at, google_calendar_id")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// --- Google Classroom ---

export type ClassroomConnection = {
  connected_at: string;
  last_synced_at: string | null;
};

export async function getClassroomConnection(): Promise<ClassroomConnection | null> {
  const { data, error } = await supabase
    .from("google_classroom_connections")
    .select("connected_at, last_synced_at")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ClassroomCourse = {
  id: string;
  name: string;
  section: string | null;
  room: string | null;
  teacher_email: string | null;
};

export async function listClassroomCourses(): Promise<ClassroomCourse[]> {
  const { data, error } = await supabase
    .from("classroom_courses")
    .select("id, name, section, room, teacher_email")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ClassroomCoursework = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  max_points: number | null;
  assigned_grade: number | null;
  submission_state: string | null;
  materials: MaterialItem[];
  rubric: Rubric | null;
};

export async function listClassroomCoursework(): Promise<ClassroomCoursework[]> {
  const { data, error } = await supabase
    .from("classroom_coursework")
    .select(
      "id, course_id, title, description, due_at, max_points, assigned_grade, submission_state, materials, rubric",
    )
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ClassroomCoursework[];
}

export type ClassroomAnnouncement = {
  id: string;
  course_id: string;
  text: string;
  created_at: string;
};

export async function listClassroomAnnouncements(): Promise<ClassroomAnnouncement[]> {
  const { data, error } = await supabase
    .from("classroom_announcements")
    .select("id, course_id, text, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type ClassroomMaterial = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  items: { title: string; url: string | null }[];
  created_at: string;
};

export async function listClassroomMaterials(): Promise<ClassroomMaterial[]> {
  const { data, error } = await supabase
    .from("classroom_materials")
    .select("id, course_id, title, description, items, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClassroomMaterial[];
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  test: "Test",
  assignment: "Assignment",
  project: "Project",
  reading: "Reading",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  submitted: "Submitted",
};

export const CATEGORY_LABELS: Record<ScheduleCategory, string> = {
  weekday: "Weekday class",
  weekend: "Weekend session",
  extracurricular: "Extracurricular",
  holiday: "Holiday session",
};

export function formatTime(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}