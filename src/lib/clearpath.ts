import { supabase } from "@/integrations/supabase/client";

export type TaskKind = "test" | "assignment" | "project" | "reading";
export type TaskStatus = "todo" | "in_progress" | "submitted";

export type Task = {
  id: string;
  title: string;
  course: string | null;
  kind: TaskKind;
  status: TaskStatus;
  due_date: string | null;
  notes: string | null;
};

const TASK_FIELDS = "id, title, course, kind, status, due_date, notes";

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_FIELDS)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(userId: string, input: Omit<Task, "id">): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...input, user_id: userId })
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