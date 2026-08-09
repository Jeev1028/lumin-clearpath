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
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/chat" });
  }, [loading, session, navigate]);

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
      void navigate({ to: "/chat" });
    }

    function init() {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        callback: (response) => void handleCredentialResponse(response),
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        width: 360,
      });
    }

    if (window.google) {
      init();
      return;
    }

    const existing = document.getElementById("google-identity-script");
    if (existing) {
      existing.addEventListener("load", init);
      return () => existing.removeEventListener("load", init);
    }

    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
    return undefined;
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
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
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your conversations stay saved to your ClearPath account.
          </p>

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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-gradient-lumin text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-[1.02]"
            >
              {mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <div ref={googleButtonRef} className="flex justify-center [&>div]:!w-full" />
          {!GOOGLE_CLIENT_ID && (
            <p className="text-center text-xs text-destructive">
              Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).
            </p>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing, you agree to ClearPath's{" "}
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
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin"
              ? "New to ClearPath? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
