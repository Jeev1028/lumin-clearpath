import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading, needsMfa } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !session) return;
    void navigate({ to: needsMfa ? "/mfa-challenge" : "/home" });
  }, [loading, session, needsMfa, navigate]);

  // Google Identity Services: a fully client-side sign-in that talks to Google
  // directly from this origin, so the account picker shows "ClearPath" (from
  // the OAuth consent screen) instead of the Supabase project domain.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

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
  }, [navigate]);

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

      <header className="mx-auto w-full max-w-6xl px-6 py-6">
        <Link to="/" className="inline-block transition-transform duration-200 hover:scale-[1.02]">
          <LuminWordmark />
        </Link>
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

                  <div ref={googleButtonRef} className="flex w-full items-center justify-center" />
                  {!GOOGLE_CLIENT_ID && (
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
