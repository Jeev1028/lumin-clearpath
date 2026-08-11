import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { refreshAccessToken } from "@/lib/google-classroom";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

type AdminClient = SupabaseClient<Database>;

export class ClassroomNotConnectedError extends Error {}
export class ClassroomTokenExpiredError extends Error {}

/** Loads the caller's Google Classroom connection and returns a valid
 * (refreshed if needed) access token, persisting the refreshed token back
 * to the connection row. Shared by every server route that calls the
 * Classroom API on the user's behalf, so the refresh logic only lives in
 * one place. */
export async function getValidClassroomAccessToken(
  admin: AdminClient,
  userId: string,
): Promise<string> {
  const { data: connection, error } = await admin
    .from("google_classroom_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load connection");
  if (!connection) throw new ClassroomNotConnectedError("Google Classroom is not connected");

  let accessToken = connection.access_token_encrypted
    ? decryptToken(connection.access_token_encrypted)
    : null;
  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;
  if (!accessToken || expiresAt - Date.now() < 60_000) {
    try {
      const refreshToken = decryptToken(connection.refresh_token_encrypted);
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      await admin
        .from("google_classroom_connections")
        .update({
          access_token_encrypted: encryptToken(accessToken),
          access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    } catch (err) {
      console.error("[google-classroom] token refresh failed", err);
      throw new ClassroomTokenExpiredError(
        "Google Classroom access has expired — please reconnect it.",
      );
    }
  }
  return accessToken;
}
