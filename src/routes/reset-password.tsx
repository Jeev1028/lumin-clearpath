import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Set a new password — ClearPath" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase's reset-password email link lands here with a recovery
    // token in the URL, which the client parses automatically into a
    // temporary session. If that session exists, the link was valid.
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        setValidLink(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setValidLink(true);
      setChecking(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password.");
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

      <main id="main-content" className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
          {checking ? (
            <p className="text-sm text-muted-foreground">Checking your link…</p>
          ) : done ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">Password updated</h1>
              <p className="text-sm text-muted-foreground">
                You&apos;re all set — you can head back in with your new password.
              </p>
              <Button
                asChild
                className="w-full bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                <Link to="/chat">Continue to ClearPath</Link>
              </Button>
            </div>
          ) : !validLink ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold">Link expired or invalid</h1>
              <p className="text-sm text-muted-foreground">
                This password reset link is no longer valid. Request a new one from the sign-in
                page.
              </p>
              <Button
                asChild
                variant="outline"
                className="w-full border-border/70 bg-background/40 text-foreground hover:text-foreground"
              >
                <Link to="/auth">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">Set a new password</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a new password for your ClearPath account.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-gradient-lumin text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-[1.02]"
                >
                  {busy ? "Updating…" : "Update password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
