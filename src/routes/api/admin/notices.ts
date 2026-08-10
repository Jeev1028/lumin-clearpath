import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, hasCapability } from "@/lib/admin-auth";

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

        const body = (await request.json().catch(() => ({}))) as { message?: string };
        const message = body.message?.trim();
        if (!message) return Response.json({ error: "Message is required." }, { status: 400 });

        const { data, error } = await admin
          .from("notices")
          .insert({ message, created_by: auth.userId, active: true })
          .select()
          .single();
        if (error) return new Response("Could not create notice", { status: 500 });
        return Response.json({ notice: data });
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
