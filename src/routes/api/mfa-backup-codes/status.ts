import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";

export const Route = createFileRoute("/api/mfa-backup-codes/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        const { count: total, error: totalError } = await admin
          .from("mfa_backup_codes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId);
        const { count: remaining, error: remainingError } = await admin
          .from("mfa_backup_codes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .is("used_at", null);

        if (totalError || remainingError) {
          return new Response("Could not load backup code status", { status: 500 });
        }

        return Response.json({ total: total ?? 0, remaining: remaining ?? 0 });
      },
    },
  },
});
