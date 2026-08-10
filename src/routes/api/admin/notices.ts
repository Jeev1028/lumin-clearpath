import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, hasCapability } from "@/lib/admin-auth";
import { escapeHtml, sendEmail } from "@/lib/email";

async function requireNoticeAdmin(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const admin = getAdminClient();
  const email = await getCallerEmail(admin, auth.userId);
  const record = await getAdminRecord(admin, auth.userId, email);
  if (!hasCapability(record, "can_manage_notices")) {
    return { error: new Response("Forbidden", { status: 403 }) } as const;
  }
  return { admin, auth } as const;
}

/** Every registered user, or (if groupIds is non-empty) the distinct union
 * of members across those groups. */
async function resolveRecipientIds(
  admin: ReturnType<typeof getAdminClient>,
  groupIds: string[] | null,
): Promise<string[]> {
  if (groupIds && groupIds.length > 0) {
    const { data } = await admin.from("group_members").select("user_id").in("group_id", groupIds);
    return [...new Set((data ?? []).map((r) => r.user_id))];
  }

  const ids: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < 200) break;
  }
  return ids;
}

async function emailNoticeToRecipients(
  admin: ReturnType<typeof getAdminClient>,
  recipientIds: string[],
  message: string,
) {
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin-bottom: 4px;">New ClearPath announcement</h2>
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
      <p><a href="https://luminclearpath.ca" style="color:#2563eb;">Open ClearPath →</a></p>
    </div>`;

  let sent = 0;
  for (const userId of recipientIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) continue;
    try {
      await sendEmail({ to: email, subject: "New ClearPath announcement", html });
      sent++;
    } catch (err) {
      console.error("[notices] email failed for", userId, err);
    }
  }
  return sent;
}

export const Route = createFileRoute("/api/admin/notices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await requireNoticeAdmin(request);
        if ("error" in result) return result.error;
        const { data, error } = await result.admin
          .from("notices")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return new Response("Could not load notices", { status: 500 });
        return Response.json({ notices: data });
      },

      POST: async ({ request }) => {
        const result = await requireNoticeAdmin(request);
        if ("error" in result) return result.error;
        const { admin, auth } = result;

        const body = (await request.json().catch(() => ({}))) as {
          message?: string;
          groupIds?: string[];
        };
        const message = body.message?.trim();
        if (!message) return Response.json({ error: "Message is required." }, { status: 400 });

        const groupIds =
          Array.isArray(body.groupIds) && body.groupIds.length > 0 ? body.groupIds : null;

        const { data, error } = await admin
          .from("notices")
          .insert({ message, created_by: auth.userId, active: true, group_ids: groupIds })
          .select()
          .single();
        if (error) return new Response("Could not create notice", { status: 500 });

        // Best-effort: the notice is already live on the site regardless of
        // whether email delivery succeeds, so failures here don't roll back
        // the notice itself.
        let emailed = 0;
        try {
          const recipientIds = await resolveRecipientIds(admin, groupIds);
          emailed = await emailNoticeToRecipients(admin, recipientIds, message);
        } catch (err) {
          console.error("[notices] failed to email recipients", err);
        }

        return Response.json({ notice: data, emailed });
      },

      PATCH: async ({ request }) => {
        const result = await requireNoticeAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const body = (await request.json().catch(() => ({}))) as {
          id?: string;
          active?: boolean;
          message?: string;
        };
        if (!body.id) return Response.json({ error: "id is required." }, { status: 400 });

        const updates: { active?: boolean; message?: string } = {};
        if (typeof body.active === "boolean") updates.active = body.active;
        if (typeof body.message === "string" && body.message.trim()) {
          updates.message = body.message.trim();
        }

        const { data, error } = await admin
          .from("notices")
          .update(updates)
          .eq("id", body.id)
          .select()
          .single();
        if (error) return new Response("Could not update notice", { status: 500 });
        return Response.json({ notice: data });
      },

      DELETE: async ({ request }) => {
        const result = await requireNoticeAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id is required." }, { status: 400 });

        const { error } = await admin.from("notices").delete().eq("id", id);
        if (error) return new Response("Could not delete notice", { status: 500 });
        return Response.json({ deleted: true });
      },
    },
  },
});
