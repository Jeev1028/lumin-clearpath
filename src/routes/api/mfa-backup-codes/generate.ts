import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { generateBackupCodes, hashBackupCode } from "@/lib/backup-codes";

export const Route = createFileRoute("/api/mfa-backup-codes/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, supabase } = auth;

        // Require an already-verified authenticator app — backup codes are
        // a fallback for 2FA, not a replacement for enabling it.
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) return new Response("Could not check 2FA status", { status: 500 });
        const hasVerifiedTotp = factors.totp.some((f) => f.status === "verified");
        if (!hasVerifiedTotp) {
          return Response.json(
            { error: "Enable an authenticator app before generating backup codes." },
            { status: 400 },
          );
        }

        const codes = generateBackupCodes(10);
        const admin = getAdminClient();

        // Regenerating invalidates every previously issued code.
        await admin.from("mfa_backup_codes").delete().eq("user_id", userId);

        const { error: insertError } = await admin.from("mfa_backup_codes").insert(
          codes.map((code) => ({
            user_id: userId,
            code_hash: hashBackupCode(code),
          })),
        );
        if (insertError) {
          console.error("[mfa-backup-codes] insert failed", insertError);
          return new Response("Could not generate backup codes", { status: 500 });
        }

        return Response.json({ codes });
      },
    },
  },
});
