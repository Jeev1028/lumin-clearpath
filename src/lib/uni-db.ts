import { supabase } from "@/integrations/supabase/client";

// The Lumin UNI tables are not in the generated Database types (that file is
// auto-generated), so this is a small untyped view of the client for them only.
type Q = {
  select: (s?: string) => Q;
  insert: (v: object) => Q;
  upsert: (v: object, o?: object) => Q;
  update: (v: object) => Q;
  delete: () => Q;
  eq: (c: string, v: string | number) => Q;
  order: (c: string, o?: object) => Q;
  single: () => Q;
  then: PromiseLike<{ data: unknown; error: { message: string } | null }>["then"];
};
export const uniDb = supabase as unknown as { from: (t: string) => Q };

export const STAGES = [
  { id: "interested", label: "Interested" },
  { id: "in_progress", label: "In progress" },
  { id: "submitted", label: "Submitted" },
  { id: "accepted", label: "Accepted" },
  { id: "waitlisted", label: "Waitlisted" },
  { id: "rejected", label: "Rejected" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

export type Urgency = "none" | "overdue" | "urgent" | "soon" | "ok";

/** Colour-coded deadline status: red within 7 days, amber within 21. */
export function urgency(deadline: string | null, today = new Date()): { level: Urgency; days: number | null } {
  if (!deadline) return { level: "none", days: null };
  const d = new Date(`${deadline}T23:59:59`);
  const days = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { level: "overdue", days };
  if (days <= 7) return { level: "urgent", days };
  if (days <= 21) return { level: "soon", days };
  return { level: "ok", days };
}
