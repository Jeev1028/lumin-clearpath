import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import {
  addSubmissionLink,
  getMySubmission,
  reclaimSubmission,
  refreshAccessToken,
  summarizeMaterial,
  turnInSubmission,
} from "@/lib/google-classroom";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

type Body = {
  courseId?: string;
  courseworkId?: string;
  action?: "turnIn" | "reclaim" | "addLink";
  url?: string;
};

export const Route = createFileRoute("/api/google-classroom/submission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId } = auth;

        const body = (await request.json().catch(() => ({}))) as Body;
        const courseId = body.courseId?.trim();
        const courseworkId = body.courseworkId?.trim();
        const action = body.action;
        const url = body.url?.trim();
        if (
          !courseId ||
          !courseworkId ||
          (action !== "turnIn" && action !== "reclaim" && action !== "addLink")
        ) {
          return Response.json(
            { error: "courseId, courseworkId, and a valid action are required." },
            { status: 400 },
          );
        }
        if (action === "addLink" && !url) {
          return Response.json({ error: "A link is required." }, { status: 400 });
        }

        const admin = getAdminClient();
        const { data: connection, error: connError } = await admin
          .from("google_classroom_connections")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (connError) return new Response("Could not load connection", { status: 500 });
        if (!connection) return new Response("Google Classroom is not connected", { status: 400 });

        let accessToken = connection.access_token_encrypted
          ? decryptToken(connection.access_token_encrypted)
          : null;
        const expiresAt = connection.access_token_expires_at
          ? new Date(connection.access_token_expires_at).getTime()
          : 0;
        if (!accessToken || expiresAt - Date.now() < 60_000) {
          try {
            const refreshToken = decryptToken(connection.refresh_token_encrypted);
            const refreshed = await refreshAccessToken(refreshToken);
            accessToken = refreshed.access_token;
            await admin
              .from("google_classroom_connections")
              .update({
                access_token_encrypted: encryptToken(accessToken),
                access_token_expires_at: new Date(
                  Date.now() + refreshed.expires_in * 1000,
                ).toISOString(),
              })
              .eq("user_id", userId);
          } catch (err) {
            console.error("[google-classroom] token refresh failed", err);
            return new Response("Google Classroom access has expired — please reconnect it.", {
              status: 409,
            });
          }
        }

        try {
          const submission = await getMySubmission(accessToken!, courseId, courseworkId);
          if (!submission) {
            return Response.json({ error: "Could not find your submission for this assignment." }, {
              status: 404,
            });
          }

          if (action === "addLink") {
            await addSubmissionLink(accessToken!, courseId, courseworkId, submission.id, url!);

            // Re-fetch so "Your work" reflects the newly attached link
            // immediately, without waiting for the next full sync.
            const updated = await getMySubmission(accessToken!, courseId, courseworkId);
            const studentWork = (updated?.assignmentSubmission?.attachments ?? [])
              .map(summarizeMaterial)
              .filter((m): m is NonNullable<typeof m> => m !== null);

            await admin
              .from("classroom_coursework")
              .update({ student_work: studentWork })
              .eq("id", courseworkId)
              .eq("user_id", userId);
            await admin
              .from("tasks")
              .update({ student_work: studentWork })
              .eq("google_classroom_id", courseworkId)
              .eq("user_id", userId);

            return Response.json({ ok: true, studentWork });
          }

          if (action === "turnIn") {
            await turnInSubmission(accessToken!, courseId, courseworkId, submission.id);
          } else {
            await reclaimSubmission(accessToken!, courseId, courseworkId, submission.id);
          }

          const newState = action === "turnIn" ? "TURNED_IN" : "CREATED";
          const newTaskStatus = action === "turnIn" ? "submitted" : "todo";

          await admin
            .from("classroom_coursework")
            .update({ submission_state: newState })
            .eq("id", courseworkId)
            .eq("user_id", userId);
          await admin
            .from("tasks")
            .update({ status: newTaskStatus })
            .eq("google_classroom_id", courseworkId)
            .eq("user_id", userId);

          return Response.json({ ok: true, submissionState: newState });
        } catch (err) {
          console.error("[google-classroom] submission action failed", err);
          const detail = err instanceof Error ? err.message : String(err);
          // Google sometimes rejects this specific write call (turnIn,
          // reclaim, modifyAttachments) even when the token genuinely
          // carries the right OAuth scope -- root cause still unconfirmed
          // (possibly Google's own app-verification requirements for
          // Classroom's write methods). Whatever the exact reason, surface
          // a clear message pointing at the guaranteed-working fallback
          // (opening the assignment directly in Google Classroom) rather
          // than a raw API error.
          const isPermissionIssue =
            /PERMISSION_DENIED|ProjectPermissionDenied|insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
              detail,
            );
          const fallbackNoun = action === "addLink" ? "attach that link" : "update your submission";
          const message = isPermissionIssue
            ? `Google didn't allow ClearPath to ${fallbackNoun} directly this time — please use Open in Google Classroom below instead.`
            : `Could not update your submission: ${detail}`;
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
