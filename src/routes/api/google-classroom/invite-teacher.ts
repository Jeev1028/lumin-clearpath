import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, getPublicOrigin, requireUser } from "@/lib/api-auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { createSignedState } from "@/lib/oauth-state";

export const Route = createFileRoute("/api/google-classroom/invite-teacher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { courseId?: string };
        const courseId = body.courseId?.trim();
        if (!courseId) return Response.json({ error: "courseId is required." }, { status: 400 });

        const admin = getAdminClient();
        const { data: course, error: courseError } = await admin
          .from("classroom_courses")
          .select("name, teacher_email")
          .eq("id", courseId)
          .eq("user_id", auth.userId)
          .maybeSingle();
        if (courseError) return new Response("Could not load course", { status: 500 });
        if (!course?.teacher_email) {
          return Response.json(
            { error: "This course's teacher email isn't available — try re-syncing Classroom." },
            { status: 400 },
          );
        }

        const { data: userData } = await admin.auth.admin.getUserById(auth.userId);
        const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const studentName =
          (meta["full_name"] as string) || (meta["name"] as string) || userData?.user?.email || "A student";

        const token = createSignedState({ courseId, teacherEmail: course.teacher_email });
        const origin = getPublicOrigin(request);
        const portalUrl = `${origin}/teacher-portal?token=${encodeURIComponent(token)}`;

        const html = `
          <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
            <p>Hi,</p>
            <p>
              <strong>${escapeHtml(studentName)}</strong> uses ClearPath, a study app, alongside
              Google Classroom for <strong>${escapeHtml(course.name)}</strong>. You don't need to
              sign up for anything — this link lets you send a private comment to any of your
              students in this class who use ClearPath, no account required:
            </p>
            <p><a href="${portalUrl}" style="color:#2563eb;">Open your class comment page →</a></p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              This link is private to you and this class. Google Classroom itself is unaffected —
              this is just an extra way to reach students who use ClearPath.
            </p>
          </div>`;

        try {
          await sendEmail({
            to: course.teacher_email,
            subject: `${studentName} invited you to comment via ClearPath — ${course.name}`,
            html,
          });
        } catch (err) {
          console.error("[invite-teacher] send failed", err);
          return new Response("Could not send the invite — please try again.", { status: 502 });
        }

        return Response.json({ sent: true, teacherEmail: course.teacher_email });
      },
    },
  },
});
