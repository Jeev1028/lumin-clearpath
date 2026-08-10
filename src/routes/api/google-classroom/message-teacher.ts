import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, getPublicOrigin, requireUser } from "@/lib/api-auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { createSignedState } from "@/lib/oauth-state";

type Body = { courseId?: string; courseworkId?: string; message?: string };

export const Route = createFileRoute("/api/google-classroom/message-teacher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const courseId = body.courseId?.trim();
        const message = body.message?.trim();
        if (!courseId || !message) {
          return Response.json({ error: "courseId and message are required." }, { status: 400 });
        }

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

        let courseworkTitle: string | null = null;
        if (body.courseworkId) {
          const { data: work } = await admin
            .from("classroom_coursework")
            .select("title")
            .eq("id", body.courseworkId)
            .eq("user_id", auth.userId)
            .maybeSingle();
          courseworkTitle = work?.title ?? null;
        }

        const { data: userData } = await admin.auth.admin.getUserById(auth.userId);
        const studentEmail = userData?.user?.email;
        const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const studentName = (meta["full_name"] as string) || (meta["name"] as string) || studentEmail || "A student";
        if (!studentEmail) return new Response("Could not identify sender", { status: 500 });

        const portalToken = createSignedState({ courseId, teacherEmail: course.teacher_email });
        const origin = getPublicOrigin(request);
        const portalUrl = `${origin}/teacher-portal?token=${encodeURIComponent(portalToken)}`;

        const html = `
          <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
            <p>Hi,</p>
            <p><strong>${escapeHtml(studentName)}</strong> sent you a private note via ClearPath${
              courseworkTitle ? ` about "${escapeHtml(courseworkTitle)}"` : ""
            } in <strong>${escapeHtml(course.name)}</strong>:</p>
            <blockquote style="border-left: 3px solid #38bdf8; margin: 16px 0; padding: 4px 16px; color: #334155; white-space: pre-wrap;">${escapeHtml(message)}</blockquote>
            <p style="color: #94a3b8; font-size: 12px;">
              Reply directly to this email to respond to ${escapeHtml(studentName)} at ${escapeHtml(studentEmail)}.
              This message was sent via ClearPath (a student study platform) because Google Classroom
              doesn't offer a way for third-party apps to post comments directly.
            </p>
            <p style="font-size: 13px;">
              <a href="${portalUrl}" style="color:#2563eb;">Open your class comment page</a> to reply
              (or start a new comment to any student in this class) without leaving a reply-all trail.
            </p>
          </div>`;

        try {
          await sendEmail({
            to: course.teacher_email,
            subject: `Note from ${studentName} — ${course.name}${courseworkTitle ? ` (${courseworkTitle})` : ""}`,
            html,
            replyTo: { email: studentEmail, name: studentName },
          });
        } catch (err) {
          console.error("[message-teacher] send failed", err);
          return new Response("Could not send your message — please try again.", { status: 502 });
        }

        await admin.from("teacher_messages").insert({
          user_id: auth.userId,
          course_id: courseId,
          coursework_id: body.courseworkId ?? null,
          teacher_email: course.teacher_email,
          message,
        });

        return Response.json({ sent: true, teacherEmail: course.teacher_email });
      },
    },
  },
});
