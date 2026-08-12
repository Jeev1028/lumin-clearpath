import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
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

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: string | number;
            },
          ) => void;
        };
      };
    };
  }
}

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

// --- PKCE helpers (Web Crypto is available inside the WKWebView) ---------

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

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading, needsMfa } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [nativeGoogleBusy, setNativeGoogleBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

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
  async function handleNativeGoogleSignIn() {
    if (!GOOGLE_IOS_CLIENT_ID) {
      toast.error(
        "Google sign-in isn't configured for the app yet (missing VITE_GOOGLE_IOS_CLIENT_ID).",
      );
      return;
    }
    setNativeGoogleBusy(true);
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

      const result = await NativeAuth.authenticate({
        url: authUrl.toString(),
        callbackScheme: schemePrefix,
      });
      const parsed = new URL(result.url);
      const code = parsed.searchParams.get("code");
      const errorDescription = parsed.searchParams.get("error_description");
      if (errorDescription) throw new Error(errorDescription);
      if (!code) throw new Error("No authorization code received.");

      const { idToken } = await NativeAuth.exchangeGoogleCode({
        code,
        codeVerifier,
        clientId: GOOGLE_IOS_CLIENT_ID,
        redirectUri,
      });

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
        nonce,
      });
      if (error) throw error;
      // The session-watching effect above handles routing from here.
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
      if (message !== "cancelled") toast.error(message);
    } finally {
      setNativeGoogleBusy(false);
    }
  }

  // Google Identity Services: a fully client-side sign-in that talks to Google
  // directly from this origin, so the account picker shows "ClearPath" (from
  // the OAuth consent screen) instead of the Supabase project domain. Only
  // used on the web / Android app (real Chrome) -- see isNative branch above
  // for why the native iOS app needs a different flow entirely.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || isNative) return;

    async function handleCredentialResponse(response: { credential: string }) {
      setBusy(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
      });
      if (error) {
        setBusy(false);
        toast.error("Google sign-in failed. Please try again.");
        return;
      }
      // The session-watching effect above handles routing (including to
      // the MFA challenge if this account has 2FA enabled).
    }

    // Google's button needs a fixed pixel width — measure the actual
    // container so it never overflows narrower phone screens, and
    // re-measure on resize/orientation change.
    function renderGoogleButton() {
      if (!window.google || !googleButtonRef.current) return;
      const available = googleButtonRef.current.offsetWidth || 360;
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        width: Math.min(360, available),
      });
    }

    function init() {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        callback: (response) => void handleCredentialResponse(response),
        use_fedcm_for_prompt: true,
      });
      renderGoogleButton();
    }

    window.addEventListener("resize", renderGoogleButton);

    if (window.google) {
      init();
      return () => window.removeEventListener("resize", renderGoogleButton);
    }

    const existing = document.getElementById("google-identity-script");
    if (existing) {
      existing.addEventListener("load", init);
      return () => {
        existing.removeEventListener("load", init);
        window.removeEventListener("resize", renderGoogleButton);
      };
    }

    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
    return () => window.removeEventListener("resize", renderGoogleButton);
  }, [navigate, isNative]);

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

                  {isNative ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={nativeGoogleBusy}
                      onClick={() => void handleNativeGoogleSignIn()}
                      className="w-full border-border/70 bg-background/40 text-foreground hover:text-foreground"
                    >
                      {nativeGoogleBusy ? "Opening Google sign-in…" : "Continue with Google"}
                    </Button>
                  ) : (
                    <>
                      <div
                        ref={googleButtonRef}
                        className="flex w-full items-center justify-center"
                      />
                      {!GOOGLE_CLIENT_ID && (
                        <p className="text-center text-xs text-destructive">
                          Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).
                        </p>
                      )}
                    </>
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
