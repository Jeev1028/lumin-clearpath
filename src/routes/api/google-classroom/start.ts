import { createFileRoute } from "@tanstack/react-router";

import { getPublicOrigin, requireUser } from "@/lib/api-auth";
import { createSignedState } from "@/lib/oauth-state";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
].join(" ");

export const Route = createFileRoute("/api/google-classroom/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const clientId = process.env["VITE_GOOGLE_CLIENT_ID"];
        if (!clientId) return new Response("Google Classroom is not configured", { status: 500 });

        const origin = getPublicOrigin(request);
        const redirectUri = `${origin}/api/google-classroom/callback`;
        const state = createSignedState({ userId: auth.userId, redirectOrigin: origin });

        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: SCOPES,
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
