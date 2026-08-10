import { createFileRoute } from "@tanstack/react-router";

import { getPublicOrigin, requireUser } from "@/lib/api-auth";
import { createSignedState } from "@/lib/oauth-state";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const Route = createFileRoute("/api/google-calendar/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const clientId = process.env["VITE_GOOGLE_CLIENT_ID"];
        if (!clientId) return new Response("Google Calendar is not configured", { status: 500 });

        const origin = getPublicOrigin(request);
        const redirectUri = `${origin}/api/google-calendar/callback`;
        const state = createSignedState({ userId: auth.userId, redirectOrigin: origin });

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPE,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
        });

        return Response.json({
          url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        });
      },
    },
  },
});
