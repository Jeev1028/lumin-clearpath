import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/native-app";

// Local iOS-only native plugin (ios/ios/App/App/NativeAuthPlugin.swift) --
// runs Google's native OAuth 2.0 (authorization code + PKCE) flow through
// ASWebAuthenticationSession, talking to Google directly instead of routing
// through Supabase's server-side redirect. See handleNativeGoogleSignIn for
// why: Supabase's signInWithOAuth() necessarily bounces through
// <project>.supabase.co first, and Google can only show verified-domain
// branding on its consent screen -- since nobody but Supabase can verify
// supabase.co, that flow shows the raw Supabase domain instead of
// ClearPath's branding. Going straight to Google avoids that hop entirely.
interface NativeAuthPlugin {
  authenticate(options: { url: string; callbackScheme: string }): Promise<{ url: string }>;
  exchangeGoogleCode(options: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }): Promise<{ idToken: string }>;
}
const NativeAuth = registerPlugin<NativeAuthPlugin>("NativeAuth");

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Lumin AI" },
      {
        name: "description",
        content: "Sign in to Lumin AI to keep your ClearPath study conversations in one place.",
      },
      { property: "og:title", content: "Sign in — Lumin AI" },
      { property: "og:description", content: "Access your ClearPath study conversations." },
    ],
  }),
  component: AuthPage,
});

const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined;
// A separate "iOS" application-type OAuth client (created in Google Cloud
// Console: Credentials → Create Credentials → OAuth client ID → iOS, bundle
// ID ca.luminclearpath.ios). Google issues iOS-type clients without a
// secret and expects the PKCE flow used below.
const GOOGLE_IOS_CLIENT_ID = import.meta.env["VITE_GOOGLE_IOS_CLIENT_ID"] as string | undefined;

// sessionStorage key holding the in-flight web/Android PKCE state while the
// page is away at accounts.google.com -- read back once Google redirects to
// redirectUri (this same /auth page) with ?code=...
const GOOGLE_PKCE_KEY = "clearpath:google-pkce";

// --- PKCE helpers (Web Crypto is available in every browser and in the
// WKWebView Capacitor uses on iOS) ------------------------------------------

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

type GoogleStage = "idle" | "opening" | "exchanging" | "signing-in";

const GOOGLE_STAGE_LABEL: Record<GoogleStage, string> = {
  idle: "Continue with Google",
  opening: "Opening Google sign-in…",
  exchanging: "Finishing sign-in…",
  "signing-in": "Signing in…",
};

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading, needsMfa } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [googleStage, setGoogleStage] = useState<GoogleStage>("idle");

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    void navigate({ to: needsMfa ? "/mfa-challenge" : "/home" });
  }, [loading, session, needsMfa, navigate]);

  // Google refuses to run its Sign-In flow inside an embedded WebView (the
  // kind Capacitor uses on iOS) as an anti-phishing policy, so native apps
  // run the OAuth flow through ASWebAuthenticationSession instead. This talks
  // to Google directly (authorization code + PKCE, the standard flow for
  // native/installed apps) rather than through Supabase's signInWithOAuth()
  // redirect, specifically so the consent screen shows ClearPath's real,
  // verified branding instead of the Supabase project domain -- see the
  // comment above NativeAuthPlugin's declaration for the full "why".
  //
  // Each native call below is wrapped in its own try/catch that re-throws
  // with a "[stage]" prefix, purely for diagnostics: a generic Capacitor
  // "plugin is not implemented" error looks identical whether the whole
  // plugin or just one specific method failed to register, and there's no
  // Mac available here for a Safari remote-debugging session against the
  // device, so the toast message itself has to carry enough detail to tell
  // which native call actually failed.
  async function handleNativeGoogleSignIn() {
    if (!GOOGLE_IOS_CLIENT_ID) {
      toast.error(
        "Google sign-in isn't configured for the app yet (missing VITE_GOOGLE_IOS_CLIENT_ID).",
      );
      return;
    }
    setGoogleStage("opening");
    try {
      const codeVerifier = randomUrlSafeString(64);
      const codeChallenge = await sha256Base64Url(codeVerifier);
      const nonce = randomUrlSafeString(32);

      // Google's "iOS" client type expects redirects on this specific
      // reversed-client-id scheme -- it's how Google guarantees the scheme
      // is unique to this exact client without needing a pre-registered
      // redirect URI allowlist (unlike web clients).
      const schemePrefix = `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.split(".")[0]}`;
      const redirectUri = `${schemePrefix}:/oauth2redirect`;

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_IOS_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("nonce", nonce);
      // Surfaces Safari's other signed-in Google accounts as a picker
      // (Pokémon GO-style) instead of silently reusing the last one.
      authUrl.searchParams.set("prompt", "select_account");

      let result: { url: string };
      try {
        result = await NativeAuth.authenticate({
          url: authUrl.toString(),
          callbackScheme: schemePrefix,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "cancelled") throw err;
        throw new Error(`[authenticate] ${msg}`);
      }

      const parsed = new URL(result.url);
      const code = parsed.searchParams.get("code");
      const errorDescription = parsed.searchParams.get("error_description");
      if (errorDescription) throw new Error(`[google-redirect] ${errorDescription}`);
      if (!code) throw new Error("[google-redirect] No authorization code received.");

      setGoogleStage("exchanging");
      let idToken: string;
      try {
        const res = await NativeAuth.exchangeGoogleCode({
          code,
          codeVerifier,
          clientId: GOOGLE_IOS_CLIENT_ID,
          redirectUri,
        });
        idToken = res.idToken;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[exchangeGoogleCode] ${msg}`);
      }

      setGoogleStage("signing-in");
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce,
      });
      if (error) throw new Error(`[signInWithIdToken] ${error.message}`);
      // The session-watching effect above handles routing from here.
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
      if (message !== "cancelled") toast.error(message);
    } finally {
      setGoogleStage("idle");
    }
  }

  // Web / Android: a full OAuth 2.0 authorization-code (+ PKCE) redirect,
  // the same kind of flow as the native one above -- NOT Google Identity
  // Services' lightweight "Sign In" widget/button, which used to be used
  // here. That widget is built on Google's newer FedCM/Identity APIs, which
  // are deliberately designed to show the *calling site's own domain*
  // rather than the OAuth consent screen's configured "Application name" on
  // its account-chooser screen, as an anti-phishing measure -- there's no
  // config that changes that, it's simply how that specific API behaves.
  // The full consent-screen flow doesn't have that restriction, which is
  // why native already used it and why this switches web/Android to match:
  // both now show "Lumin ClearPath" (the real app name) instead of
  // "luminclearpath.ca" (the raw domain) on Google's account picker.
  //
  // Unlike the native flow, this exchanges the code for an ID token via a
  // server route (see src/routes/api/google-oauth-exchange.ts) rather than
  // doing it directly from the browser: the web OAuth client has a real
  // client secret (unlike the iOS one), so there's no reason to expose that
  // to the browser when a server round-trip avoids it entirely.
  async function handleWebGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).");
      return;
    }
    setGoogleStage("opening");
    try {
      const codeVerifier = randomUrlSafeString(64);
      const codeChallenge = await sha256Base64Url(codeVerifier);
      const nonce = randomUrlSafeString(32);
      const state = randomUrlSafeString(24);
      const redirectUri = `${window.location.origin}/auth`;

      sessionStorage.setItem(
        GOOGLE_PKCE_KEY,
        JSON.stringify({ codeVerifier, nonce, state, redirectUri }),
      );

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("nonce", nonce);
      authUrl.searchParams.set("state", state);
      // Surfaces Google's other signed-in accounts in this browser as a
      // picker instead of silently reusing whichever was used last.
      authUrl.searchParams.set("prompt", "select_account");

      window.location.href = authUrl.toString();
      // Execution effectively stops here -- the page is navigating away.
    } catch (err) {
      setGoogleStage("idle");
      toast.error(err instanceof Error ? err.message : "Could not start Google sign-in.");
    }
  }

  // Catches the redirect back from handleWebGoogleSignIn above (Google
  // appends ?code=...&state=... to redirectUri, which is this same page).
  // Native sign-in never touches the URL like this, so this is safe to run
  // unconditionally regardless of isNative.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorDescription = params.get("error_description");
    const returnedState = params.get("state");
    if (!code && !errorDescription) return;

    // Strip the query string immediately so a page reload can't try to
    // reuse an already-spent (or stale) authorization code.
    window.history.replaceState(null, "", window.location.pathname);

    (async () => {
      setGoogleStage("exchanging");
      try {
        if (errorDescription) throw new Error(errorDescription);

        const raw = sessionStorage.getItem(GOOGLE_PKCE_KEY);
        sessionStorage.removeItem(GOOGLE_PKCE_KEY);
        if (!raw) throw new Error("Your sign-in session expired — please try again.");
        const stored = JSON.parse(raw) as {
          codeVerifier: string;
          nonce: string;
          state: string;
          redirectUri: string;
        };
        if (!returnedState || returnedState !== stored.state) {
          throw new Error("Could not verify this sign-in — please try again.");
        }
        if (!code) throw new Error("No authorization code received.");

        const res = await fetch("/api/google-oauth-exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            codeVerifier: stored.codeVerifier,
            redirectUri: stored.redirectUri,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Could not complete Google sign-in.");
        }
        const { idToken } = (await res.json()) as { idToken: string };

        setGoogleStage("signing-in");
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
          nonce: stored.nonce,
        });
        if (error) throw new Error(error.message);
        // The session-watching effect above handles routing from here.
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Google sign-in failed. Please try again.",
        );
      } finally {
        setGoogleStage("idle");
      }
    })();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/chat` },
        });
        if (error) throw error;
        toast.success("Account created — check your inbox if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "signin" | "signup" | "reset") {
    setMode(next);
    setResetSent(false);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-deep">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="glow-orb absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 opacity-50" />
      </div>

      <header className="safe-top w-full">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link
            to={session ? "/home" : "/"}
            className="inline-block transition-transform duration-200 hover:scale-[1.02]"
          >
            <LuminWordmark />
          </Link>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" && "Welcome back"}
            {mode === "signup" && "Create your account"}
            {mode === "reset" && "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "reset"
              ? "We'll email you a link to set a new password."
              : "Your conversations stay saved to your ClearPath account."}
          </p>

          {mode === "reset" && resetSent ? (
            <div className="mt-6 space-y-4">
              <p className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
                Check your inbox — we sent a password reset link to{" "}
                <span className="text-foreground">{email}</span>.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full border-border/70 bg-background/40 text-foreground hover:text-foreground"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {mode !== "reset" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => switchMode("reset")}
                          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-gradient-lumin text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-[1.02]"
                >
                  {mode === "signin" && "Sign in"}
                  {mode === "signup" && "Sign up"}
                  {mode === "reset" && "Send reset link"}
                </Button>
              </form>

              {mode !== "reset" && (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={googleStage !== "idle"}
                    onClick={() =>
                      void (isNative ? handleNativeGoogleSignIn() : handleWebGoogleSignIn())
                    }
                    className="w-full border-border/70 bg-background/40 text-foreground hover:text-foreground"
                  >
                    {GOOGLE_STAGE_LABEL[googleStage]}
                  </Button>
                  {!isNative && !GOOGLE_CLIENT_ID && (
                    <p className="text-center text-xs text-destructive">
                      Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).
                    </p>
                  )}
                </>
              )}

              <p className="mt-4 text-center text-xs text-muted-foreground">
                By continuing, you agree to ClearPath&apos;s{" "}
                <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                  Privacy Policy
                </Link>
                .
              </p>

              <button
                type="button"
                className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" && "New to ClearPath? Create an account"}
                {mode === "signup" && "Already have an account? Sign in"}
                {mode === "reset" && "Back to sign in"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
