import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "@/lib/api-auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { verifySignedState } from "@/lib/oauth-state";

// Teachers don't have ClearPath accounts, so this route intentionally isn't
// behind requireUser -- access is instead controlled entirely by possession
// of a valid signed token (mailed only to the course's real teacher email).
const PORTAL_TOKEN_MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000; // ~1 school term

function verifyPortalToken(token: string | null) {
  if (!token) return null;
  const payload = verifySignedState(token, PORTAL_TOKEN_MAX_AGE_MS);
  if (!payload?.["courseId"] || !payload?.["teacherEmail"]) return null;
  return { courseId: payload["courseId"], teacherEmail: payload["teacherEmail"] };
}

export const Route = createFileRoute("/api/teacher-portal")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        const claims = verifyPortalToken(token);
        if (!claims) return new Response("This link is invalid or has expired.", { status: 401 });

        const admin = getAdminClient();

        const { data: courseRows } = await admin
          .from("classroom_courses")
          .select("id, name, user_id, teacher_email")
          .eq("id", claims.courseId);
        const matching = (courseRows ?? []).filter(
          (c) => (c.teacher_email ?? "").toLowerCase() === claims.teacherEmail.toLowerCase(),
        );
        if (matching.length === 0) {
          return new Response("This course could not be found.", { status: 404 });
        }
        const courseName = matching[0]!.name;

        const students: { userId: string; name: string; email: string }[] = [];
        for (const row of matching) {
          const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
          if (!userData?.user?.email) continue;
          const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
          students.push({
            userId: row.user_id,
            name: (meta["full_name"] as string) || (meta["name"] as string) || userData.user.email,
            email: userData.user.email,
          });
        }

        const { data: coursework } = await admin
          .from("classroom_coursework")
          .select("id, title")
          .eq("course_id", claims.courseId);
        const uniqueCoursework = [...new Map((coursework ?? []).map((c) => [c.id, c])).values()];

        return Response.json({ courseName, students, coursework: uniqueCoursework });
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          token?: string;
          studentUserId?: string;
          courseworkId?: string;
          message?: string;
        };
        const claims = verifyPortalToken(body.token ?? null);
        if (!claims) return new Response("This link is invalid or has expired.", { status: 401 });

        const studentUserId = body.studentUserId?.trim();
        const message = body.message?.trim();
        if (!studentUserId || !message) {
          return Response.json({ error: "A student and a message are required." }, { status: 400 });
        }

        const admin = getAdminClient();

        // Confirm this student is actually enrolled in this course before
        // letting the (token-authenticated) teacher write to their account.
        const { data: enrollment } = await admin
          .from("classroom_courses")
          .select("user_id")
          .eq("id", claims.courseId)
          .eq("user_id", studentUserId)
          .maybeSingle();
        if (!enrollment) {
          return Response.json({ error: "That student isn't enrolled in this course." }, { status: 400 });
        }

        const { error: insertError } = await admin.from("teacher_comments").insert({
          user_id: studentUserId,
          course_id: claims.courseId,
          coursework_id: body.courseworkId || null,
          teacher_email: claims.teacherEmail,
          message,
        });
        if (insertError) return new Response("Could not save your comment.", { status: 500 });

        const { data: userData } = await admin.auth.admin.getUserById(studentUserId);
        const studentEmail = userData?.user?.email;
        if (studentEmail) {
          const html = `
            <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
              <p>Your teacher left you a private comment on ClearPath:</p>
              <blockquote style="border-left: 3px solid #38bdf8; margin: 16px 0; padding: 4px 16px; color: #334155; white-space: pre-wrap;">${escapeHtml(message)}</blockquote>
              <p><a href="https://luminclearpath.ca/classroom" style="color:#2563eb;">View it on ClearPath →</a></p>
            </div>`;
          try {
            await sendEmail({ to: studentEmail, subject: "Your teacher left you a comment", html });
          } catch (err) {
            console.error("[teacher-portal] student notification failed", err);
          }
        }

        return Response.json({ sent: true });
      },
    },
  },
});
