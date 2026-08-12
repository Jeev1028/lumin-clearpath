// Google sign-in for the extension, adapted from the same PKCE flow used
// on the website and in the iOS app (see src/routes/auth.tsx in the main
// project for the full "why" -- short version: the full OAuth consent
// screen shows the app's real verified branding, unlike Google Identity
// Services' lightweight widget, which shows the calling site's raw
// domain instead and can't be configured around that).
//
// The one extension-specific piece is chrome.identity.launchWebAuthFlow,
// Chrome's purpose-built API for exactly this "open a URL, wait for a
// redirect back to this extension" pattern -- it watches for a redirect to
// https://<extension-id>.chromiumapp.org/*, which only works because this
// extension has a stable id (see manifest.json's "key" field, generated
// once so the id doesn't change every reload -- see extension/README.md).

const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string;
const API_ORIGIN = (import.meta.env["VITE_API_ORIGIN"] as string) || "https://luminclearpath.ca";

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i] ?? 0);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafeString(length: number): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer).slice(0, length);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64UrlEncode(digest);
}

/** Runs the full Google sign-in flow and returns a Supabase-ready ID token
 * + the nonce it was bound to. Throws on failure/cancellation. */
export async function signInWithGoogle(): Promise<{ idToken: string; nonce: string }> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).");
  }

  const codeVerifier = randomUrlSafeString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const nonce = randomUrlSafeString(32);
  const redirectUri = chrome.identity.getRedirectURL();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const redirectedTo = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!redirectedTo) throw new Error("cancelled");

  const parsed = new URL(redirectedTo);
  const code = parsed.searchParams.get("code");
  const errorDescription = parsed.searchParams.get("error_description");
  if (errorDescription) throw new Error(errorDescription);
  if (!code) throw new Error("No authorization code received.");

  const res = await fetch(`${API_ORIGIN}/api/google-oauth-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Could not complete Google sign-in.");
  }
  const { idToken } = (await res.json()) as { idToken: string };
  return { idToken, nonce };
}
