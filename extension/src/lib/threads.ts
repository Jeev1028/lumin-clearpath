import type { UIMessage } from "ai";

import { supabase } from "./supabase";

const THREAD_ID_KEY = "clearpath:extension-thread-id";

/**
 * The extension keeps a single ongoing conversation (unlike the website,
 * which has a full thread list/sidebar) -- simpler UI for a popup, and
 * still shows up alongside the student's other conversations in their
 * account on luminclearpath.ca/chat if they want the full history view.
 * The thread itself is a normal row in the same `threads` table the
 * website uses (inserted directly via the Supabase client + RLS, exactly
 * like src/lib/threads.ts on the website does -- no dedicated API route
 * exists for this, so this mirrors that same pattern).
 */
export async function getOrCreateThreadId(userId: string): Promise<string> {
  const stored = await chrome.storage.local.get(THREAD_ID_KEY);
  const existingId = stored[THREAD_ID_KEY] as string | undefined;
  if (existingId) {
    const { data } = await supabase.from("threads").select("id").eq("id", existingId).maybeSingle();
    if (data) return existingId;
    // Thread was deleted (e.g. from the website) -- fall through and
    // create a fresh one.
  }

  const { data, error } = await supabase
    .from("threads")
    .insert({ user_id: userId, title: "Browser extension" })
    .select("id")
    .single();
  if (error) throw error;

  await chrome.storage.local.set({ [THREAD_ID_KEY]: data.id });
  return data.id;
}

export async function loadThreadMessages(threadId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text", text: m.content }],
  }));
}
