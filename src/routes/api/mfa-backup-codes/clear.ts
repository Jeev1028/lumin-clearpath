import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";

// Called when a user disables 2FA — their backup codes should stop working
// immediately rather than lingering as an unused bypass.
export const Route = createFileRoute("/api/mfa-backup-codes/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        await admin.from("mfa_backup_codes").delete().eq("user_id", auth.userId);

        return Response.json({ cleared: true });
      },
    },
  },
});
