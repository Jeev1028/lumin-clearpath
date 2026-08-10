import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail, type AdminCapability } from "@/lib/admin-auth";

const CAPABILITIES: AdminCapability[] = [
  "can_view_users",
  "can_view_grades",
  "can_manage_notices",
  "can_send_email",
];

function normalizeCapabilities(input: unknown): Record<AdminCapability, boolean> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out = {} as Record<AdminCapability, boolean>;
  for (const cap of CAPABILITIES) out[cap] = Boolean(raw[cap]);
  return out;
}

async function requireRoot(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const admin = getAdminClient();
  const email = await getCallerEmail(admin, auth.userId);
  const record = await getAdminRecord(admin, auth.userId, email);
  if (!record?.is_root) return { error: new Response("Forbidden — root admin only", { status: 403 }) } as const;
  return { admin, auth, record } as const;
}

async function findUserByEmail(admin: ReturnType<typeof getAdminClient>, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

export const Route = createFileRoute("/api/admin/admins")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = await requireRoot(request);
        if ("error" in result) return result.error;
        const { data, error } = await result.admin
          .from("admins")
          .select("*")
          .order("granted_at", { ascending: true });
        if (error) return new Response("Could not load admins", { status: 500 });
        return Response.json({ admins: data });
      },

      POST: async ({ request }) => {
        const result = await requireRoot(request);
        if ("error" in result) return result.error;
        const { admin, auth } = result;

        const body = (await request.json().catch(() => ({}))) as {
          email?: string;
          capabilities?: unknown;
        };
        const email = body.email?.trim();
        if (!email) return Response.json({ error: "Email is required." }, { status: 400 });

        const user = await findUserByEmail(admin, email);
        if (!user) {
          return Response.json(
            { error: "No ClearPath account with that email exists yet — they need to sign up first." },
            { status: 404 },
          );
        }

        const capabilities = normalizeCapabilities(body.capabilities);
        const { data, error } = await admin
          .from("admins")
          .upsert({
            user_id: user.id,
            email: user.email ?? email,
            is_root: false,
            granted_by: auth.userId,
            ...capabilities,
          })
          .select()
          .single();
        if (error) return new Response("Could not grant admin access", { status: 500 });
        return Response.json({ admin: data });
      },

      PATCH: async ({ request }) => {
        const result = await requireRoot(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const body = (await request.json().catch(() => ({}))) as {
          user_id?: string;
          capabilities?: unknown;
        };
        if (!body.user_id) return Response.json({ error: "user_id is required." }, { status: 400 });

        const { data: existing } = await admin
          .from("admins")
          .select("is_root")
          .eq("user_id", body.user_id)
          .maybeSingle();
        if (existing?.is_root) {
          return Response.json({ error: "The root admin's access can't be edited." }, { status: 400 });
        }

        const capabilities = normalizeCapabilities(body.capabilities);
        const { data, error } = await admin
          .from("admins")
          .update(capabilities)
          .eq("user_id", body.user_id)
          .select()
          .single();
        if (error) return new Response("Could not update admin access", { status: 500 });
        return Response.json({ admin: data });
      },

      DELETE: async ({ request }) => {
        const result = await requireRoot(request);
        if ("error" in result) return result.error;
        const { admin } = result;

        const userId = new URL(request.url).searchParams.get("user_id");
        if (!userId) return Response.json({ error: "user_id is required." }, { status: 400 });

        const { data: existing } = await admin
          .from("admins")
          .select("is_root")
          .eq("user_id", userId)
          .maybeSingle();
        if (existing?.is_root) {
          return Response.json({ error: "The root admin can't be removed." }, { status: 400 });
        }

        const { error } = await admin.from("admins").delete().eq("user_id", userId);
        if (error) return new Response("Could not revoke admin access", { status: 500 });
        return Response.json({ revoked: true });
      },
    },
  },
});
