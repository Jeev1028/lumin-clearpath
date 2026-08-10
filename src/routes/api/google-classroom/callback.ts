import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, getPublicOrigin } from "@/lib/api-auth";
import { exchangeCodeForTokens } from "@/lib/google-classroom";
import { verifySignedState } from "@/lib/oauth-state";
import { encryptToken } from "@/lib/token-crypto";

export const Route = createFileRoute("/api/google-classroom/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        const publicOrigin = getPublicOrigin(request);
        const payload = state ? verifySignedState(state) : null;
        const redirectOrigin = payload?.["redirectOrigin"] ?? publicOrigin;
        const classroomUrl = (status: string) => `${redirectOrigin}/classroom?classroom=${status}`;

        if (errorParam) {
          return Response.redirect(classroomUrl("denied"), 302);
        }
        if (!code || !payload?.["userId"]) {
          return Response.redirect(classroomUrl("error"), 302);
        }

        try {
          const redirectUri = `${publicOrigin}/api/google-classroom/callback`;
          const tokens = await exchangeCodeForTokens(code, redirectUri);
          if (!tokens.refresh_token) {
            return Response.redirect(classroomUrl("error"), 302);
          }

          const admin = getAdminClient();
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const { error } = await admin.from("google_classroom_connections").upsert(
            {
              user_id: payload["userId"],
              refresh_token_encrypted: encryptToken(tokens.refresh_token),
              access_token_encrypted: encryptToken(tokens.access_token),
              access_token_expires_at: expiresAt,
            },
            { onConflict: "user_id" },
          );
          if (error) throw error;

          return Response.redirect(classroomUrl("connected"), 302);
        } catch (err) {
          console.error("[google-classroom] callback failed", err);
          return Response.redirect(classroomUrl("error"), 302);
        }
      },
    },
  },
});
