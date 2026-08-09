import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { UIMessage } from "ai";
import { toast } from "sonner";

import { ChatWindow } from "@/components/lumin/ChatWindow";
import { LuminMark } from "@/components/lumin/LuminMark";
import { ThreadSidebar } from "@/components/lumin/ThreadSidebar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createThread, deleteThread, listMessages, listThreads } from "@/lib/threads";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat with Lumin AI" },
      {
        name: "description",
        content: "Research, understand and study with Lumin AI, the ClearPath study companion.",
      },
      { property: "og:title", content: "Chat with Lumin AI" },
      { property: "og:description", content: "Your ClearPath study conversation." },
    ],
  }),
  component: ChatThreadPage,
});

function ChatThreadPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const threadsQuery = useQuery({
    queryKey: ["threads"],
    queryFn: listThreads,
    enabled: Boolean(user),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => listMessages(threadId),
    enabled: Boolean(user),
  });

  if (loading || !user || !session || messagesQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-deep">
        <LuminMark className="h-14 w-14 animate-pulse" />
      </div>
    );
  }

  const initialMessages: UIMessage[] = (messagesQuery.data ?? []).map((row) => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    parts: [{ type: "text", text: row.content }],
  }));

  async function handleNewThread() {
    try {
      const thread = await createThread(user!.id);
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a new conversation.");
    }
  }

  async function handleDeleteThread(id: string) {
    try {
      await deleteThread(id);
      const remaining = (threadsQuery.data ?? []).filter((t) => t.id !== id);
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      if (id === threadId) {
        if (remaining[0]) {
          await navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
        } else {
          await navigate({ to: "/chat" });
        }
      }
    } catch {
      toast.error("Could not delete that conversation.");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <ThreadSidebar
          threads={threadsQuery.data ?? []}
          activeId={threadId}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
          onSignOut={handleSignOut}
        />
      </div>
      <ChatWindow
        key={threadId}
        threadId={threadId}
        initialMessages={initialMessages}
        accessToken={session.access_token}
        onActivity={() => {
          void queryClient.invalidateQueries({ queryKey: ["threads"] });
        }}
      />
    </div>
  );
}