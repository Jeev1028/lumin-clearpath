import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    async function refreshMfaStatus() {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setNeedsMfa(Boolean(data && data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel));
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      if (next) void refreshMfaStatus();
      else setNeedsMfa(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) void refreshMfaStatus();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, needsMfa };
}
