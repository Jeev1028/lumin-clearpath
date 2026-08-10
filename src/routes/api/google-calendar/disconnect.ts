import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { revokeGoogleToken } from "@/lib/google-calendar";
import { decryptToken } from "@/lib/token-crypto";

export const Route = createFileRoute("/api/google-calendar/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const admin = getAdminClient();
        const { data: connection } = await admin
          .from("google_calendar_connections")
          .select("refresh_token_encrypted")
          .eq("user_id", auth.userId)
          .maybeSingle();

        if (connection) {
          try {
            await revokeGoogleToken(decryptToken(connection.refresh_token_encrypted));
          } catch (err) {
            console.error("[google-calendar] revoke failed (continuing to disconnect)", err);
          }
        }

        await admin.from("google_calendar_connections").delete().eq("user_id", auth.userId);
        return Response.json({ disconnected: true });
      },
    },
  },
});
