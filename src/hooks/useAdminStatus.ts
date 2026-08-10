import { useEffect, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

export type AdminRecord = {
  user_id: string;
  email: string;
  is_root: boolean;
  can_view_users: boolean;
  can_view_grades: boolean;
  can_manage_notices: boolean;
  can_send_email: boolean;
};

export function useAdminStatus() {
  const { session, loading: authLoading } = useAuth();
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for useAuth's own initial resolution before concluding anything
    // -- otherwise `session` starts out null on first render regardless of
    // whether the visitor is actually signed in, and consumers would
    // briefly see "not loading, not an admin" before the real check runs.
    if (authLoading) return;
    if (!session) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { admin: AdminRecord | null };
        if (!cancelled) setAdmin(data.admin);
      } catch {
        // non-fatal — just won't show admin UI
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, session]);

  return { admin, loading, isAdmin: Boolean(admin) };
}
