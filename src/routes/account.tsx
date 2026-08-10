import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { user, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    setFullName(meta["full_name"] || meta["name"] || "");
    setPhone(meta["phone_number"] || "");
    setAvatarUrl(meta["avatar_url"] || meta["picture"]);
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-deep">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const initial = (fullName || user.email || "?").charAt(0).toUpperCase();

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Please choose an image under 2MB.");
      return;
    }
    setAvatarBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: data.publicUrl },
      });
      if (updateError) throw updateError;

      setAvatarUrl(data.publicUrl);
      toast.success("Profile picture updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your picture.");
    } finally {
      setAvatarBusy(false);
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
              onChange={(e) => void handleAvatarChange(e)}
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
      </main>
    </div>
  );
}
