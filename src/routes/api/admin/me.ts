import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { getAdminRecord, getCallerEmail } from "@/lib/admin-auth";

export const Route = createFileRoute("/api/admin/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        const email = await getCallerEmail(admin, auth.userId);
        const record = await getAdminRecord(admin, auth.userId, email);

        return Response.json({ admin: record });
      },
    },
  },
});
