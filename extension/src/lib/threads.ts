import type { UIMessage } from "ai";

import { supabase } from "./supabase";

const ACTIVE_THREAD_ID_KEY = "clearpath:extension-thread-id";

export type Thread = {
  id: string;
  title: string;
  updated_at: string;
};

/**
 * The extension used to keep a single ongoing conversation (unlike the
 * website, which has a full thread list/sidebar). It now supports switching
 * between conversations too, via ThreadSwitcher in App.tsx -- this just
 * tracks which one is currently active in the popup, persisted across
 * popup open/close via chrome.storage.local (see supabase.ts for why that's
 * used instead of localStorage). Threads themselves are normal rows in the
 * same `threads` table the website uses (inserted directly via the
 * Supabase client + RLS, exactly like src/lib/threads.ts on the website
 * does -- no dedicated API route exists for this, so this mirrors that same
 * pattern), so every conversation started here also shows up in the full
 * history view at luminclearpath.ca/chat.
 */
export async function getActiveThreadId(): Promise<string | null> {
  const stored = await chrome.storage.local.get(ACTIVE_THREAD_ID_KEY);
  return (stored[ACTIVE_THREAD_ID_KEY] as string | undefined) ?? null;
}

export async function setActiveThreadId(id: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_THREAD_ID_KEY]: id });
}

export async function listThreads(userId: string): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createThread(userId: string): Promise<Thread> {
  const { data, error } = await supabase
    .from("threads")
    .insert({ user_id: userId, title: "Browser extension" })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  await setActiveThreadId(data.id);
  return data;
}

export async function deleteThread(id: string): Promise<void> {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
}

/** Picks which thread the popup should open to on load: whichever one was
 * last active (if it still exists), otherwise the most recently updated
 * one, otherwise a brand new conversation. Returns the full thread list too
 * so the switcher has something to show immediately, without a second
 * round-trip. */
export async function resolveInitialThread(
  userId: string,
): Promise<{ threads: Thread[]; activeId: string }> {
  const threads = await listThreads(userId);
  const storedId = await getActiveThreadId();

  if (storedId && threads.some((t) => t.id === storedId)) {
    return { threads, activeId: storedId };
  }
  if (threads[0]) {
    await setActiveThreadId(threads[0].id);
    return { threads, activeId: threads[0].id };
  }

  const created = await createThread(userId);
  return { threads: [created], activeId: created.id };
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
