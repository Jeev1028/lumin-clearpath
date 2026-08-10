import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const BACKUP_OVERRIDE_KEY = "clearpath:mfa-backup-verified";

function readBackupOverride(): string | null {
  try {
    return sessionStorage.getItem(BACKUP_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/**
 * Backup codes verify identity through our own API route rather than
 * Supabase's factor-challenge flow, so they can't elevate the session's
 * real AAL. Since nothing in this app gates data access on AAL (MFA is
 * enforced only at the route level via `needsMfa`), we record a per-tab,
 * per-user override here once a backup code has been verified server-side,
 * so the app's own MFA gate treats this sign-in as satisfied.
 */
export function markMfaSatisfiedWithBackupCode(userId: string) {
  try {
    sessionStorage.setItem(BACKUP_OVERRIDE_KEY, userId);
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — non-fatal.
  }
}

function clearBackupOverride() {
  try {
    sessionStorage.removeItem(BACKUP_OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    async function refreshMfaStatus(userId: string) {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const required = Boolean(data && data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel);
      const satisfiedByBackupCode = readBackupOverride() === userId;
      setNeedsMfa(required && !satisfiedByBackupCode);
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_OUT") clearBackupOverride();
      if (next) void refreshMfaStatus(next.user.id);
      else setNeedsMfa(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) void refreshMfaStatus(data.session.user.id);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, needsMfa };
}
