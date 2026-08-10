import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { toast } from "sonner";

import { ChatWindow } from "@/components/lumin/ChatWindow";
import { LuminMark } from "@/components/lumin/LuminMark";
import { SiteHeader } from "@/components/lumin/SiteHeader";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Close the mobile drawer automatically if the thread changes (e.g. from
  // a link click, which already closes it, but also covers any other nav).
  useEffect(() => {
    setSidebarOpen(false);
  }, [threadId]);

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
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Same site-wide header used everywhere else, so account access
          (profile menu + sign out) and navigation are consistent across
          the whole app. The hamburger (mobile only) opens the thread
          drawer below since the persistent sidebar is hidden under md. */}
      <SiteHeader
        leading={
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversation menu"
            className="rounded-lg p-2 text-foreground hover:bg-secondary/60 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        }
        trailing={
          <button
            type="button"
            onClick={() => void handleNewThread()}
            aria-label="New conversation"
            className="rounded-lg p-2 text-foreground hover:bg-secondary/60 md:hidden"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <ThreadSidebar
            threads={threadsQuery.data ?? []}
            activeId={threadId}
            onNewThread={handleNewThread}
            onDeleteThread={handleDeleteThread}
            onSignOut={handleSignOut}
            showBranding={false}
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

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <ThreadSidebar
              threads={threadsQuery.data ?? []}
              activeId={threadId}
              onNewThread={handleNewThread}
              onDeleteThread={handleDeleteThread}
              onSignOut={handleSignOut}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
