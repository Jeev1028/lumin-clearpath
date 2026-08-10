-- Admin roles with per-capability granular permissions. jeevin102811@gmail.com
-- is treated as a hardcoded "root" admin in application code (auto-provisioned
-- into this table with every capability the first time they access an admin
-- route) and is the only account that can grant/revoke/edit other admins.
-- RLS is enabled with NO policies for authenticated/anon roles -- every read
-- and write goes through server routes (service role) that verify the
-- caller's own admin status/capabilities first. This table controls a real
-- security boundary, so it must never be directly reachable from the client.

CREATE TABLE public.admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_root BOOLEAN NOT NULL DEFAULT false,
  can_view_users BOOLEAN NOT NULL DEFAULT false,
  can_view_grades BOOLEAN NOT NULL DEFAULT false,
  can_manage_notices BOOLEAN NOT NULL DEFAULT false,
  can_send_email BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- School-wide notices shown as a dismissible banner across the app. Reading
-- active notices is public (no sensitive data, needs to work for signed-out
-- visitors on the homepage too); creating/editing/deleting is admin-only via
-- server routes using the service role, so no write policies are defined.
CREATE TABLE public.notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active notices" ON public.notices
  FOR SELECT
  USING (active = true);

-- Lightweight audit trail for admin-sent emails. Service-role only.
CREATE TABLE public.admin_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sent_by UUID REFERENCES auth.users(id),
  recipient_count INT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_email_log ENABLE ROW LEVEL SECURITY;
