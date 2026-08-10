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
  return { admin, auth } as const;
}

export const Route = createFileRoute("/api/admin/groups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const { data: groups, error } = await admin
          .from("groups")
          .select("*")
          .order("name", { ascending: true });
        if (error) return new Response("Could not load groups", { status: 500 });

        const { data: memberRows } = await admin.from("group_members").select("group_id");
        const counts = new Map<string, number>();
        for (const row of memberRows ?? []) {
          counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
        }

        return Response.json({
          groups: (groups ?? []).map((g) => ({ ...g, member_count: counts.get(g.id) ?? 0 })),
        });
      },

      POST: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin, auth } = result;

        const body = (await request.json().catch(() => ({}))) as { name?: string };
        const name = body.name?.trim();
        if (!name) return Response.json({ error: "Group name is required." }, { status: 400 });

        const { data, error } = await admin
          .from("groups")
          .insert({ name, created_by: auth.userId })
          .select()
          .single();
        if (error) return new Response("Could not create group", { status: 500 });
        return Response.json({ group: { ...data, member_count: 0 } });
      },

      DELETE: async ({ request }) => {
        const result = await requireGroupAdmin(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id is required." }, { status: 400 });

        const { error } = await admin.from("groups").delete().eq("id", id);
        if (error) return new Response("Could not delete group", { status: 500 });
        return Response.json({ deleted: true });
      },
    },
  },
});
