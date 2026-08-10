-- One-time-use MFA backup/recovery codes, for signing in when a user has
-- lost access to their authenticator app. Codes are generated server-side,
-- shown to the user exactly once, and stored here only as a keyed hash so
-- even a full database leak can't be used to sign in as someone. RLS is
-- enabled with no policies for the authenticated/anon roles -- only the
-- service role (used exclusively by the /api/mfa-backup-codes/* server
-- routes) can read or write this table.

CREATE TABLE public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mfa_backup_codes_user_id_idx ON public.mfa_backup_codes (user_id);
CREATE UNIQUE INDEX mfa_backup_codes_hash_idx ON public.mfa_backup_codes (code_hash);

ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;
