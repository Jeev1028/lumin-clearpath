import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { LuminMark } from "@/components/lumin/LuminMark";
import { useAuth } from "@/hooks/useAuth";
import { setAfterLogin } from "@/lib/after-login";
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
  validateSearch: (search: Record<string, unknown>): { ask?: string | undefined } => {
    const ask = search["ask"];
    return { ask: typeof ask === "string" && ask.trim() ? ask.slice(0, 4000) : undefined };
  },
  component: ChatIndex,
});

const PENDING_ASK_KEY = "lumin-chat-ask";

function ChatIndex() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const { ask } = Route.useSearch();
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (ask) {
        // Keep the request across sign-in, then come back to /chat.
        try {
          sessionStorage.setItem(PENDING_ASK_KEY, ask);
        } catch {
          // ignore
        }
        setAfterLogin("/chat");
      }
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        let pending = ask;
        if (!pending) {
          try {
            pending = sessionStorage.getItem(PENDING_ASK_KEY) ?? undefined;
            sessionStorage.removeItem(PENDING_ASK_KEY);
          } catch {
            // ignore
          }
        }
        if (pending) {
          const fresh = await createThread(user.id);
          try {
            sessionStorage.setItem(`clearpath:chat-prefill:${fresh.id}`, pending);
          } catch {
            // the chat just opens empty
          }
          await navigate({ to: "/chat/$threadId", params: { threadId: fresh.id } });
          return;
        }
        const threads = await listThreads();
        const target = threads[0] ?? (await createThread(user.id));
        await navigate({ to: "/chat/$threadId", params: { threadId: target.id } });
      } catch {
        started.current = false;
      }
    })();
  }, [loading, user, needsMfa, navigate, ask]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep">
      <LuminMark className="h-44 w-44 animate-pulse sm:h-60 sm:w-60" />
    </div>
  );
}
