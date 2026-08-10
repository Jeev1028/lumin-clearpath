import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Factor } from "@supabase/supabase-js";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AvatarCropDialog } from "@/components/lumin/AvatarCropDialog";
import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account settings — ClearPath" },
      { name: "description", content: "Manage your ClearPath profile." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(true);
  const [savingDigestPref, setSavingDigestPref] = useState(false);

  const [mfaFactors, setMfaFactors] = useState<Factor[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [enrollData, setEnrollData] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  const [backupStatus, setBackupStatus] = useState<{ total: number; remaining: number } | null>(
    null,
  );
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    setFullName((meta["full_name"] as string) || (meta["name"] as string) || "");
    setPhone((meta["phone_number"] as string) || "");
    setAvatarUrl((meta["avatar_url"] as string) || (meta["picture"] as string) || undefined);
    setEmailDigestEnabled(meta["email_digest_enabled"] !== false);
    void loadFactors();
  }, [loading, user, needsMfa, navigate]);

  async function loadFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;
    setMfaFactors(data.all);
    const hasVerifiedTotp = data.all.some((f) => f.factor_type === "totp" && f.status === "verified");
    if (hasVerifiedTotp) await loadBackupStatus();
  }

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not signed in");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }

  async function loadBackupStatus() {
    try {
      const headers = await authHeader();
      const res = await fetch("/api/mfa-backup-codes/status", { headers });
      if (!res.ok) return;
      const data = (await res.json()) as { total: number; remaining: number };
      setBackupStatus(data);
    } catch {
      // non-fatal — the "Generate codes" button still works without this
    }
  }

  async function handleGenerateBackupCodes() {
    setBackupBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch("/api/mfa-backup-codes/generate", {
        method: "POST",
        headers,
      });
      const data = (await res.json().catch(() => ({}))) as { codes?: string[]; error?: string };
      if (!res.ok || !data.codes) throw new Error(data.error || "Could not generate backup codes.");
      setBackupCodes(data.codes);
      setBackupStatus({ total: data.codes.length, remaining: data.codes.length });
      toast.success("Backup codes generated — save them somewhere safe.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate backup codes.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleToggleEmailDigest(nextValue: boolean) {
    setEmailDigestEnabled(nextValue);
    setSavingDigestPref(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { email_digest_enabled: nextValue },
      });
      if (error) throw error;
    } catch (err) {
      setEmailDigestEnabled(!nextValue);
      toast.error(err instanceof Error ? err.message : "Could not save that preference.");
    } finally {
      setSavingDigestPref(false);
    }
  }

  function handleDownloadBackupCodes() {
    if (!backupCodes) return;
    const contents = [
      `ClearPath backup codes`,
      `Each code works once. Keep this somewhere safe.`,
      ``,
      ...backupCodes,
      ``,
    ].join("\n");
    const blob = new Blob([contents], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clearpath-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-deep">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const initial = (fullName || user.email || "?").charAt(0).toUpperCase();
  const verifiedTotp = mfaFactors.find((f) => f.factor_type === "totp" && f.status === "verified");

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Please choose an image under 2MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (pendingImageSrc) URL.revokeObjectURL(pendingImageSrc);
    setPendingImageSrc(URL.createObjectURL(file));
    setCropDialogOpen(true);
  }

  async function handleCropConfirm(blob: Blob) {
    if (!user) return;
    setAvatarBusy(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: "image/png" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: data.publicUrl },
      });
      if (updateError) throw updateError;

      setAvatarUrl(data.publicUrl);
      toast.success("Profile picture updated.");
      setCropDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your picture.");
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleCropDialogOpenChange(open: boolean) {
    if (avatarBusy) return;
    setCropDialogOpen(open);
    if (!open) {
      if (pendingImageSrc) URL.revokeObjectURL(pendingImageSrc);
      setPendingImageSrc(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), phone_number: phone.trim() },
      });
      if (error) throw error;
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your changes.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleStartEnroll() {
    setMfaBusy(true);
    try {
      const stale = mfaFactors.find((f) => f.factor_type === "totp" && f.status === "unverified");
      if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id });

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setEnrollData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start 2FA setup.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleVerifyEnroll(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollData) return;
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.factorId,
        code: verifyCode.trim(),
      });
      if (error) throw error;
      toast.success("Two-factor authentication enabled.");
      setEnrollData(null);
      setVerifyCode("");
      await loadFactors();
      await handleGenerateBackupCodes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setMfaBusy(false);
    }
  }

  function handleCancelEnroll() {
    setEnrollData(null);
    setVerifyCode("");
  }

  async function handleDisableMfa() {
    if (!verifiedTotp) return;
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotp.id });
      if (error) throw error;
      try {
        const headers = await authHeader();
        await fetch("/api/mfa-backup-codes/clear", { method: "POST", headers });
      } catch {
        // non-fatal — codes are already useless without an enrolled factor
      }
      setBackupStatus(null);
      setBackupCodes(null);
      toast.success("Two-factor authentication disabled.");
      await loadFactors();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable 2FA.");
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pb-24">
        <h1 className="mt-10 text-3xl font-bold">Account settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your profile picture and personal details.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-5 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <Avatar className="h-20 w-20 border border-border/70 shadow-glow">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName || "Profile"} />}
            <AvatarFallback className="bg-gradient-lumin text-xl font-semibold text-primary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
            >
              {avatarBusy ? "Uploading…" : "Change picture"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF. Max 2MB.</p>
          </div>
        </div>

        <form
          onSubmit={handleSaveProfile}
          className="mt-6 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
        >
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              Your email is tied to how you sign in and can&apos;t be changed here.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
          <Button
            type="submit"
            disabled={savingProfile}
            className="bg-gradient-lumin text-primary-foreground shadow-glow"
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div>
            <p className="text-sm font-semibold">Email reminders</p>
            <p className="text-xs text-muted-foreground">
              Get a daily email if you have tasks due today or overdue.
            </p>
          </div>
          <Switch
            checked={emailDigestEnabled}
            disabled={savingDigestPref}
            onCheckedChange={(checked) => void handleToggleEmailDigest(checked)}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                verifiedTotp ? "bg-emerald-400/10" : "bg-accent/10"
              }`}
            >
              {verifiedTotp ? (
                <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden />
              ) : (
                <ShieldOff className="h-5 w-5 text-accent" aria-hidden />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Two-factor authentication</p>
              <p className="text-xs text-muted-foreground">
                {verifiedTotp
                  ? "Enabled — an authenticator app code is required to sign in."
                  : "Add an extra layer of security with an authenticator app."}
              </p>
            </div>
            {!enrollData &&
              (verifiedTotp ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mfaBusy}
                  onClick={() => void handleDisableMfa()}
                  className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
                >
                  Disable
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={mfaBusy}
                  onClick={() => void handleStartEnroll()}
                  className="bg-gradient-lumin text-primary-foreground"
                >
                  Enable
                </Button>
              ))}
          </div>

          {enrollData && (
            <form onSubmit={handleVerifyEnroll} className="mt-6 space-y-4 border-t border-border/60 pt-6">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password,
                etc.), or enter the code manually. Then confirm it below.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={enrollData.qrCode}
                  alt="Scan this QR code with your authenticator app"
                  className="h-40 w-40 rounded-xl border border-border/70 bg-white p-2"
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter manually:</p>
                  <code className="mt-1 block max-w-full break-all rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
                    {enrollData.secret}
                  </code>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verify-code">6-digit code</Label>
                <Input
                  id="verify-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  className="max-w-40 text-center text-lg tracking-[0.5em]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={mfaBusy || verifyCode.length !== 6}
                  className="bg-gradient-lumin text-primary-foreground shadow-glow"
                >
                  {mfaBusy ? "Verifying…" : "Verify & enable"}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancelEnroll}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep your authenticator app accessible — if you lose it, contact{" "}
                <a href="mailto:lumin-support@luminclearpath.ca" className="underline">
                  lumin-support@luminclearpath.ca
                </a>{" "}
                to regain access.
              </p>
            </form>
          )}

          {verifiedTotp && !enrollData && (
            <div className="mt-6 border-t border-border/60 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Backup codes</p>
                  <p className="text-xs text-muted-foreground">
                    {backupStatus
                      ? `${backupStatus.remaining} of ${backupStatus.total} unused codes remaining.`
                      : "One-time codes you can use to sign in if you lose your authenticator app."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={backupBusy}
                  onClick={() => void handleGenerateBackupCodes()}
                  className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
                >
                  {backupBusy
                    ? "Generating…"
                    : backupStatus && backupStatus.total > 0
                      ? "Regenerate codes"
                      : "Generate codes"}
                </Button>
              </div>

              {backupCodes && (
                <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-4">
                  <p className="text-xs text-muted-foreground">
                    Save these somewhere safe — each code works once, and you won&apos;t be able to
                    see them again.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
                    {backupCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded-lg border border-border/50 bg-card/60 px-3 py-1.5 text-center"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadBackupCodes}
                      className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
                    >
                      Download .txt
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setBackupCodes(null)}
                    >
                      Done, I saved them
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <AvatarCropDialog
        imageSrc={pendingImageSrc}
        open={cropDialogOpen}
        onOpenChange={handleCropDialogOpenChange}
        onConfirm={(blob) => void handleCropConfirm(blob)}
        busy={avatarBusy}
      />
    </div>
  );
}
