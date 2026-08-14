import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Factor } from "@supabase/supabase-js";
import { Moon, ShieldCheck, ShieldOff, Sun, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AvatarCropDialog } from "@/components/lumin/AvatarCropDialog";
import { SiteHeader } from "@/components/lumin/SiteHeader";
import { useTheme } from "@/components/lumin/ThemeProvider";
import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { TextSize } from "@/components/lumin/AccessibilityProvider";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Settings — ClearPath" },
      { name: "description", content: "Manage your ClearPath profile." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const {
    prefs: soundPrefs,
    setPrefs: setSoundPrefs,
    playTone,
    speak,
    voices,
    recommendedVoiceURI,
  } = useSoundSettings();
  const { theme, setTheme, mode, setMode } = useTheme();
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
  const [textSize, setTextSize] = useState<TextSize>("default");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [sidebarNav, setSidebarNav] = useState(false);
  const [savingA11yPref, setSavingA11yPref] = useState(false);

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
    setTextSize((meta["a11y_text_size"] as TextSize) || "default");
    setReducedMotion(Boolean(meta["a11y_reduced_motion"]));
    setHighContrast(Boolean(meta["a11y_high_contrast"]));
    setSidebarNav(Boolean(meta["a11y_sidebar_nav"]));
    void loadFactors();
  }, [loading, user, needsMfa, navigate]);

  async function loadFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return;
    setMfaFactors(data.all);
    const hasVerifiedTotp = data.all.some(
      (f) => f.factor_type === "totp" && f.status === "verified",
    );
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

  async function saveA11yPrefs(next: {
    textSize?: TextSize;
    reducedMotion?: boolean;
    highContrast?: boolean;
    sidebarNav?: boolean;
  }) {
    setSavingA11yPref(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          a11y_text_size: next.textSize ?? textSize,
          a11y_reduced_motion: next.reducedMotion ?? reducedMotion,
          a11y_high_contrast: next.highContrast ?? highContrast,
          a11y_sidebar_nav: next.sidebarNav ?? sidebarNav,
        },
      });
      if (error) throw error;
      // Applied instantly by AccessibilityProvider once the auth state
      // refreshes, but set it directly too so the change feels immediate.
      const html = document.documentElement;
      if (next.textSize !== undefined) html.setAttribute("data-text-size", next.textSize);
      if (next.reducedMotion !== undefined)
        html.setAttribute("data-reduced-motion", String(next.reducedMotion));
      if (next.highContrast !== undefined)
        html.setAttribute("data-high-contrast", String(next.highContrast));
      if (next.sidebarNav !== undefined)
        html.setAttribute("data-sidebar-nav", String(next.sidebarNav));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that preference.");
    } finally {
      setSavingA11yPref(false);
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
      <main id="main-content" className="mx-auto max-w-2xl px-6 pb-24">
        <h1 className="mt-10 text-3xl font-bold">Settings</h1>
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

        <div className="mt-6 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div>
            <p className="text-sm font-semibold">Detail</p>
            <p className="text-xs text-muted-foreground">
              Fully customize how Lumin looks -- light or dark, and a color theme. Applies
              everywhere you're signed in, including the app.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">Mode</p>
            <div className="inline-flex rounded-full border border-border/60 bg-background/40 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("dark");
                  playTone("click");
                }}
                aria-pressed={mode === "dark"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "dark"
                    ? "bg-secondary/80 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Moon className="h-3.5 w-3.5" aria-hidden />
                Dark
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("light");
                  playTone("click");
                }}
                aria-pressed={mode === "light"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "light"
                    ? "bg-secondary/80 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Sun className="h-3.5 w-3.5" aria-hidden />
                Light
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-4 sm:grid-cols-5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  playTone("click");
                }}
                aria-pressed={theme === t.id}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors",
                  theme === t.id
                    ? "border-accent bg-accent/10"
                    : "border-border/60 hover:border-border",
                )}
              >
                <span
                  aria-hidden
                  className="h-8 w-8 rounded-full border border-white/10"
                  style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}
                />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div>
            <p className="text-sm font-semibold">Accessibility</p>
            <p className="text-xs text-muted-foreground">
              These apply across all of ClearPath, on any device you sign in on.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="text-size" className="text-sm font-normal">
              Text size
            </Label>
            <Select
              value={textSize}
              disabled={savingA11yPref}
              onValueChange={(value) => {
                setTextSize(value as TextSize);
                void saveA11yPrefs({ textSize: value as TextSize });
              }}
            >
              <SelectTrigger id="text-size" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="x-large">Extra large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Reduce motion</p>
              <p className="text-xs text-muted-foreground">
                Turns off animations and transitions across the app.
              </p>
            </div>
            <Switch
              checked={reducedMotion}
              disabled={savingA11yPref}
              onCheckedChange={(checked) => {
                setReducedMotion(checked);
                void saveA11yPrefs({ reducedMotion: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">High contrast</p>
              <p className="text-xs text-muted-foreground">
                Brighter borders and text for better visibility.
              </p>
            </div>
            <Switch
              checked={highContrast}
              disabled={savingA11yPref}
              onCheckedChange={(checked) => {
                setHighContrast(checked);
                void saveA11yPrefs({ highContrast: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Sidebar navigation</p>
              <p className="text-xs text-muted-foreground">
                On wide screens (a web browser window) or a device turned sideways, show navigation
                as a sidebar instead of a top bar. Stays a top bar on narrow portrait screens either
                way.
              </p>
            </div>
            <Switch
              checked={sidebarNav}
              disabled={savingA11yPref}
              onCheckedChange={(checked) => {
                setSidebarNav(checked);
                void saveA11yPrefs({ sidebarNav: checked });
              }}
            />
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
          <div>
            <p className="text-sm font-semibold">Sound</p>
            <p className="text-xs text-muted-foreground">
              The intro chime, Lumin reading replies aloud, notification chimes and small UI sound
              effects. These also apply on the ClearPath app.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">All sounds</p>
              <p className="text-xs text-muted-foreground">Master switch for everything below.</p>
            </div>
            <Switch
              checked={soundPrefs.enabled}
              onCheckedChange={(checked) => {
                setSoundPrefs({ enabled: checked });
                if (checked) playTone("click");
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Intro chime</p>
              <p className="text-xs text-muted-foreground">
                The short piano sound when the app opens.
              </p>
            </div>
            <Switch
              checked={soundPrefs.introChime}
              disabled={!soundPrefs.enabled}
              onCheckedChange={(checked) => setSoundPrefs({ introChime: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Read Lumin&apos;s replies aloud</p>
              <p className="text-xs text-muted-foreground">
                Automatically speaks each new chat reply. You can also tap the speaker icon on any
                message to hear it on demand, regardless of this setting.
              </p>
            </div>
            <Switch
              checked={soundPrefs.readMessagesAloud}
              disabled={!soundPrefs.enabled}
              onCheckedChange={(checked) => setSoundPrefs({ readMessagesAloud: checked })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Voice</p>
              <p className="text-xs text-muted-foreground">
                Which voice reads replies aloud. &quot;Auto&quot; picks the best-sounding free voice
                your browser offers.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={soundPrefs.voiceURI ?? "auto"}
                disabled={!soundPrefs.enabled}
                onValueChange={(value) => setSoundPrefs({ voiceURI: value === "auto" ? null : value })}
              >
                <SelectTrigger id="read-aloud-voice" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (recommended)</SelectItem>
                  {[...voices]
                    .sort((a, b) => {
                      const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
                      const aMatch = a.lang.startsWith(lang.slice(0, 2));
                      const bMatch = b.lang.startsWith(lang.slice(0, 2));
                      if (aMatch !== bMatch) return aMatch ? -1 : 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map((v) => (
                      <SelectItem key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                        {v.voiceURI === recommendedVoiceURI ? " — recommended" : ""} ({v.lang})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!soundPrefs.enabled}
                onClick={() =>
                  speak("Hi, I'm Lumin AI. This is what I sound like when I read replies aloud.")
                }
                aria-label="Preview voice"
                title="Preview voice"
              >
                <Volume2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">Notification sound</p>
              <p className="text-xs text-muted-foreground">
                A short chime when a new notification or reminder arrives.
              </p>
            </div>
            <Switch
              checked={soundPrefs.notificationSound}
              disabled={!soundPrefs.enabled}
              onCheckedChange={(checked) => {
                setSoundPrefs({ notificationSound: checked });
                if (checked) playTone("notify");
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm">UI sound effects</p>
              <p className="text-xs text-muted-foreground">
                Small tones for things like completing a task or matching flashcards.
              </p>
            </div>
            <Switch
              checked={soundPrefs.uiEffects}
              disabled={!soundPrefs.enabled}
              onCheckedChange={(checked) => {
                setSoundPrefs({ uiEffects: checked });
                if (checked) playTone("success");
              }}
            />
          </div>
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
            <form
              onSubmit={handleVerifyEnroll}
              className="mt-6 space-y-4 border-t border-border/60 pt-6"
            >
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
