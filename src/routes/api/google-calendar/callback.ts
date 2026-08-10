import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "@/lib/api-auth";
import { exchangeCodeForTokens } from "@/lib/google-calendar";
import { verifySignedState } from "@/lib/oauth-state";
import { encryptToken } from "@/lib/token-crypto";

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      // Google redirects the browser here with ?code=&state= after consent.
      // No Authorization header is available on this plain GET request —
      // the signed state is what ties this back to a ClearPath user.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        const payload = state ? verifySignedState(state) : null;
        const redirectOrigin = payload?.["redirectOrigin"] ?? url.origin;
        const scheduleUrl = (status: string) => `${redirectOrigin}/schedule?calendar=${status}`;

        if (errorParam) {
          return Response.redirect(scheduleUrl("denied"), 302);
        }
        if (!code || !payload?.["userId"]) {
          return Response.redirect(scheduleUrl("error"), 302);
        }

        try {
          const redirectUri = `${url.origin}/api/google-calendar/callback`;
          const tokens = await exchangeCodeForTokens(code, redirectUri);
          if (!tokens.refresh_token) {
            // Google only issues a refresh token on first consent (or when
            // prompt=consent forces re-consent, which /start always sets),
            // so this shouldn't normally happen — but fail loudly if it does
            // rather than silently storing a connection with no way to renew.
            return Response.redirect(scheduleUrl("error"), 302);
          }

          const admin = getAdminClient();
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
          const { error } = await admin.from("google_calendar_connections").upsert(
            {
              user_id: payload["userId"],
              refresh_token_encrypted: encryptToken(tokens.refresh_token),
              access_token_encrypted: encryptToken(tokens.access_token),
              access_token_expires_at: expiresAt,
              google_calendar_id: "primary",
            },
            { onConflict: "user_id" },
          );
          if (error) throw error;

          return Response.redirect(scheduleUrl("connected"), 302);
        } catch (err) {
          console.error("[google-calendar] callback failed", err);
          return Response.redirect(scheduleUrl("error"), 302);
        }
      },
    },
  },
});
