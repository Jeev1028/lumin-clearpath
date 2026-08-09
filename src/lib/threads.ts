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