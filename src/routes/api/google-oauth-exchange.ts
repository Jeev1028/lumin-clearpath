import { createFileRoute } from "@tanstack/react-router";

// Finishes the web/Android/extension Google sign-in flow: trades an
// authorization code (from the full OAuth 2.0 consent screen, not the
// lightweight GIS widget -- see the comment in src/routes/auth.tsx for why
// this switch happened) for an ID token. Runs server-side specifically so
// GOOGLE_CLIENT_SECRET never has to be shipped to the browser/extension --
// the web OAuth client (unlike the iOS one) has a real secret, so there's
// no reason to lean on PKCE alone here the way the native flow has to.
//
// Deliberately unauthenticated: this endpoint is *part of* signing in, so
// there's no Supabase session to check yet.
function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  if (!origin.startsWith("chrome-extension://")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const Route = createFileRoute("/api/google-oauth-exchange")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      },
      POST: async ({ request }) => {
        const cors = corsHeaders(request);
        const clientId = process.env["VITE_GOOGLE_CLIENT_ID"];
        const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
        if (!clientId || !clientSecret) {
          return new Response("Google sign-in is not configured", { status: 500, headers: cors });
        }

        const body = (await request.json().catch(() => ({}))) as {
          code?: string;
          codeVerifier?: string;
          redirectUri?: string;
        };
        const { code, codeVerifier, redirectUri } = body;
        if (!code || !codeVerifier || !redirectUri) {
          return new Response("Missing code, codeVerifier, or redirectUri", {
            status: 400,
            headers: cors,
          });
        }

        const params = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        });

        let data: { id_token?: string; error?: string; error_description?: string };
        try {
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
          data = (await res.json().catch(() => ({}))) as typeof data;
          if (!res.ok || !data.id_token) {
            return new Response(
              data.error_description || data.error || "Could not complete Google sign-in",
              { status: 400, headers: cors },
            );
          }
        } catch (err) {
          console.error("[google-oauth-exchange] token request failed", err);
          return new Response("Could not reach Google — please try again.", {
            status: 502,
            headers: cors,
          });
        }

        return Response.json({ idToken: data.id_token }, { headers: cors });
      },
    },
  },
});
