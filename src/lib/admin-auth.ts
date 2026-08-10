import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

// The only account that can grant/revoke/edit other admins. Hardcoded
// rather than stored as a mutable flag so admin-of-admins access can never
// be reassigned via a data bug or a compromised row.
export const ROOT_ADMIN_EMAIL = "jeevin102811@gmail.com";

export type AdminRecord = Database["public"]["Tables"]["admins"]["Row"];
export type AdminCapability =
  | "can_view_users"
  | "can_view_grades"
  | "can_manage_notices"
  | "can_send_email";

function isRootEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === ROOT_ADMIN_EMAIL;
}

/**
 * Looks up (and auto-provisions, for the hardcoded root email) the caller's
 * admin record. Returns null if they aren't an admin at all. Always uses
 * the service-role client -- callers must never expose this to the browser.
 */
export async function getAdminRecord(
  admin: SupabaseClient<Database>,
  userId: string,
  email: string | null | undefined,
): Promise<AdminRecord | null> {
  const { data } = await admin.from("admins").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data;

  if (isRootEmail(email)) {
    const { data: created } = await admin
      .from("admins")
      .insert({
        user_id: userId,
        email: email!,
        is_root: true,
        can_view_users: true,
        can_view_grades: true,
        can_manage_notices: true,
        can_send_email: true,
      })
      .select()
      .single();
    return created ?? null;
  }

  return null;
}

export async function getCallerEmail(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export function hasCapability(record: AdminRecord | null, capability: AdminCapability): boolean {
  if (!record) return false;
  if (record.is_root) return true;
  return Boolean(record[capability]);
}
