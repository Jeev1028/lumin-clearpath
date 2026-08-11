import { createFileRoute } from "@tanstack/react-router";

import { getPublicOrigin, requireUser } from "@/lib/api-auth";
import { createSignedState } from "@/lib/oauth-state";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  // Full (not read-only) coursework scope -- covers both viewing and
  // turning in / reclaiming a student's own submissions. There is no
  // separate "write" scope for student-submissions; turn-in actions are
  // gated by this scope instead, so the readonly submissions scope below
  // is kept only for reading grades/state.
  "https://www.googleapis.com/auth/classroom.coursework.me",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  // Read-only teacher roster + profile email, used solely to relay a
  // student's private note to their real teacher by email (Classroom's API
  // has no comment/messaging endpoint of its own).
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  // Narrow, per-file Drive access -- only grants access to files the
  // student explicitly picks via the Google Picker widget (browsing their
  // Drive) or uploads through it, never blanket access to their whole
  // Drive. Used to attach a Drive file to a submission.
  "https://www.googleapis.com/auth/drive.file",
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
