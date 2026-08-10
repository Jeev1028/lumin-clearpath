import { supabase } from "@/integrations/supabase/client";

export type Thread = {
  id: string;
  title: string;
  updated_at: string;
};

export async function listThreads(): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createThread(userId: string): Promise<Thread> {
  const { data, error } = await supabase
    .from("threads")
    .insert({ user_id: userId })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteThread(id: string): Promise<void> {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
}

function escapeLikePattern(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === "%" || char === "_" || char === "\\") {
      out += "\\" + char;
    } else {
      out += char;
    }
  }
  return out;
}

/** Matches on thread title OR any message body within the thread, since
 * titles are just derived from the first message and often don't reflect
 * what was actually discussed later in a conversation. */
export async function searchThreads(query: string): Promise<Thread[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const pattern = `%${escapeLikePattern(trimmed)}%`;

  const [titleMatches, messageMatches] = await Promise.all([
    supabase.from("threads").select("id, title, updated_at").ilike("title", pattern),
    supabase.from("messages").select("thread_id").ilike("content", pattern).limit(200),
  ]);
  if (titleMatches.error) throw titleMatches.error;
  if (messageMatches.error) throw messageMatches.error;

  const byId = new Map<string, Thread>();
  for (const t of titleMatches.data ?? []) byId.set(t.id, t);

  const missingIds = [...new Set((messageMatches.data ?? []).map((m) => m.thread_id))].filter(
    (id) => !byId.has(id),
  );
  if (missingIds.length > 0) {
    const { data: extraThreads, error } = await supabase
      .from("threads")
      .select("id, title, updated_at")
      .in("id", missingIds);
    if (error) throw error;
    for (const t of extraThreads ?? []) byId.set(t.id, t);
  }

  return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export type StoredMessage = {
  id: string;
  role: string;
  content: string;
};

export async function listMessages(threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
