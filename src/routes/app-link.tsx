import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { setAfterLogin } from "@/lib/after-login";

// Opened by the Lumin Calendar iOS app inside its sign-in sheet. After the
// student signs in (any method this site supports), it hands the app a
// calendar-feed link so their classes, tasks and study plan appear there.

export const Route = createFileRoute("/app-link")({
  head: () => ({
    meta: [{ title: "Connect Lumin Calendar" }, { name: "robots", content: "noindex" }],
  }),
  component: AppLinkPage,
});

function AppLinkPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setAfterLogin("/app-link");
      void navigate({ to: "/auth" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/calendar-feed/link", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error("link");
        const { httpsUrl } = (await res.json()) as { httpsUrl: string };
        const url = `lumincal://link?url=${encodeURIComponent(httpsUrl)}`;
        if (cancelled) return;
        setTarget(url);
        window.location.href = url;
      } catch {
        if (!cancelled) setError("Could not connect right now. Close this and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-deep p-6 text-center">
      <h1 className="text-2xl font-bold">Connecting Lumin Calendar…</h1>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : target ? (
        <>
          <p className="text-sm text-muted-foreground">Signed in. Returning to the app.</p>
          <Button asChild>
            <a href={target}>Open Lumin Calendar</a>
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">One moment.</p>
      )}
    </main>
  );
}
