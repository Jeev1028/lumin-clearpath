import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import {
  ClassroomNotConnectedError,
  ClassroomTokenExpiredError,
  getValidClassroomAccessToken,
} from "@/lib/classroom-connection";

/** Hands the browser a short-lived Google access token so the Google
 * Picker widget (an inherently client-side component) can browse/upload
 * to the student's Drive. This is the standard, expected pattern for
 * Picker -- the token is scoped narrowly to drive.file (only files the
 * student explicitly picks or uploads through the widget) and expires
 * within the hour like any other Google access token. */
export const Route = createFileRoute("/api/google-classroom/picker-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        try {
          const accessToken = await getValidClassroomAccessToken(admin, auth.userId);
          return Response.json({ accessToken });
        } catch (err) {
          if (err instanceof ClassroomNotConnectedError) {
            return new Response("Google Classroom is not connected", { status: 400 });
          }
          if (err instanceof ClassroomTokenExpiredError) {
            return new Response(err.message, { status: 409 });
          }
          return new Response("Could not load connection", { status: 500 });
        }
      },
    },
  },
});
