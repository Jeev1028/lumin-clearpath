import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, hasCapability } from "@/lib/admin-auth";
import { escapeHtml, sendEmail } from "@/lib/email";

type SendBody = { userIds?: string[]; subject?: string; body?: string };

export const Route = createFileRoute("/api/admin/send-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        const callerEmail = await getCallerEmail(admin, auth.userId);
        const record = await getAdminRecord(admin, auth.userId, callerEmail);
        if (!hasCapability(record, "can_send_email")) {
          return new Response("Forbidden", { status: 403 });
        }

        const payload = (await request.json().catch(() => ({}))) as SendBody;
        const userIds = Array.isArray(payload.userIds) ? payload.userIds.slice(0, 500) : [];
        const subject = payload.subject?.trim();
        const bodyText = payload.body?.trim();
        if (userIds.length === 0) {
          return Response.json({ error: "Select at least one recipient." }, { status: 400 });
        }
        if (!subject || !bodyText) {
          return Response.json({ error: "Subject and message are required." }, { status: 400 });
        }

        const html = `
          <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
            <p style="white-space: pre-wrap;">${escapeHtml(bodyText)}</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
              Sent by a ClearPath administrator.
            </p>
          </div>`;

        let sent = 0;
        let failed = 0;
        for (const userId of userIds) {
          const { data: userData } = await admin.auth.admin.getUserById(userId);
          const email = userData?.user?.email;
          if (!email) {
            failed++;
            continue;
          }
          try {
            await sendEmail({ to: email, subject, html });
            sent++;
          } catch (err) {
            console.error("[admin/send-email] failed for", userId, err);
            failed++;
          }
        }

        await admin.from("admin_email_log").insert({
          sent_by: auth.userId,
          recipient_count: sent,
          subject,
        });

        return Response.json({ sent, failed });
      },
    },
  },
});
