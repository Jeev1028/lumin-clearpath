import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, hasCapability } from "@/lib/admin-auth";

async function requireGroupAdmin(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const admin = getAdminClient();
  const email = await getCallerEmail(admin, auth.userId);
  const record = await getAdminRecord(admin, auth.userId, email);
  if (!hasCapability(record, "can_manage_groups")) {
    return { error: new Response("Forbidden", { status: 403 }) } as const;
  }
  return { admin } as const;
}

export const Route = createFileRoute("/api/admin/group-members")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const groupId = new URL(request.url).searchParams.get("group_id");
        if (!groupId) return Response.json({ error: "group_id is required." }, { status: 400 });

        const { data: rows, error } = await admin
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);
        if (error) return new Response("Could not load group members", { status: 500 });

        const members: { id: string; email: string | null }[] = [];
        for (const row of rows ?? []) {
          const { data } = await admin.auth.admin.getUserById(row.user_id);
          members.push({ id: row.user_id, email: data?.user?.email ?? null });
        }

        return Response.json({ members });
      },

      POST: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const body = (await request.json().catch(() => ({}))) as {
          groupId?: string;
          userId?: string;
        };
        if (!body.groupId || !body.userId) {
          return Response.json({ error: "groupId and userId are required." }, { status: 400 });
        }

        const { error } = await admin
          .from("group_members")
          .upsert({ group_id: body.groupId, user_id: body.userId });
        if (error) return new Response("Could not add member", { status: 500 });
        return Response.json({ added: true });
      },

      DELETE: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const url = new URL(request.url);
        const groupId = url.searchParams.get("group_id");
        const userId = url.searchParams.get("user_id");
        if (!groupId || !userId) {
          return Response.json({ error: "group_id and user_id are required." }, { status: 400 });
        }

        const { error } = await admin
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", userId);
        if (error) return new Response("Could not remove member", { status: 500 });
        return Response.json({ removed: true });
      },
    },
  },
});
