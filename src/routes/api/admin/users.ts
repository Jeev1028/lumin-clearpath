import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, hasCapability } from "@/lib/admin-auth";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        const email = await getCallerEmail(admin, auth.userId);
        const record = await getAdminRecord(admin, auth.userId, email);
        if (!hasCapability(record, "can_view_users")) {
          return new Response("Forbidden", { status: 403 });
        }

        const { data: adminRows } = await admin.from("admins").select("user_id");
        const adminIds = new Set((adminRows ?? []).map((r) => r.user_id));

        // listUsers is paginated (default 50/page) -- pull enough pages to
        // cover a school's worth of accounts without going unbounded.
        const users: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string;
          last_sign_in_at: string | null;
          is_admin: boolean;
        }[] = [];
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) return new Response("Could not load users", { status: 500 });
          for (const u of data.users) {
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
            users.push({
              id: u.id,
              email: u.email ?? null,
              full_name: (meta["full_name"] as string) || (meta["name"] as string) || null,
              created_at: u.created_at,
              last_sign_in_at: u.last_sign_in_at ?? null,
              is_admin: adminIds.has(u.id),
            });
          }
          if (data.users.length < 200) break;
        }

        return Response.json({ users });
      },
    },
  },
});
