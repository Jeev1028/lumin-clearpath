import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import { hashBackupCode } from "@/lib/backup-codes";

type VerifyBody = { code?: string };

export const Route = createFileRoute("/api/mfa-backup-codes/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => ({}))) as VerifyBody;
        const code = body.code?.trim();
        if (!code) return Response.json({ ok: false, error: "Enter a backup code." }, { status: 400 });

        const admin = getAdminClient();
        const hash = hashBackupCode(code);

        const { data: row, error: findError } = await admin
          .from("mfa_backup_codes")
          .select("id")
          .eq("user_id", auth.userId)
          .eq("code_hash", hash)
          .is("used_at", null)
          .maybeSingle();
        if (findError) return new Response("Could not verify backup code", { status: 500 });
        if (!row) {
          return Response.json(
            { ok: false, error: "That backup code is invalid or has already been used." },
            { status: 401 },
          );
        }

        await admin
          .from("mfa_backup_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("id", row.id);

        const { count: remaining } = await admin
          .from("mfa_backup_codes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .is("used_at", null);

        return Response.json({ ok: true, remaining: remaining ?? 0 });
      },
    },
  },
});
