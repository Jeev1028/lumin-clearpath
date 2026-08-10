import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Verifies the Bearer token on an incoming server-route request and
 * returns the authenticated user's id plus a Supabase client scoped to
 * that user (so RLS applies normally). Server-only.
 */
export async function requireUser(
  request: Request,
): Promise<{ userId: string; supabase: ReturnType<typeof createClient<Database>> } | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  return { userId, supabase };
}

/**
 * Service-role client for server-only writes that must bypass RLS (e.g.
 * writing encrypted OAuth tokens, which the client is never allowed to
 * write directly). Never expose this client or its key to the browser.
 */
export function getAdminClient() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured");
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
