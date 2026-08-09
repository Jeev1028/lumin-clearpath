import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LuminMark } from "@/components/lumin/LuminMark";
import { useAuth } from "@/hooks/useAuth";
import { createThread, listThreads } from "@/lib/threads";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Your conversations — Lumin AI" },
      { name: "description", content: "Open or start a Lumin AI study conversation." },
      { property: "og:title", content: "Your conversations — Lumin AI" },
      { property: "og:description", content: "Open or start a Lumin AI study conversation." },
    ],
  }),
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const threads = await listThreads();
        const target = threads[0] ?? (await createThread(user.id));
        await navigate({ to: "/chat/$threadId", params: { threadId: target.id } });
      } catch {
        started.current = false;
      }
    })();
  }, [loading, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep">
      <LuminMark className="h-14 w-14 animate-pulse" />
    </div>
  );
}