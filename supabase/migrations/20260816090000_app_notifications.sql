-- Persistent in-app notification feed -- students already get emails for
-- new assignments, grades, and teacher comments, but had nowhere to
-- revisit them in-app if they missed the email. Writes only ever happen
-- from server routes using the service-role client (no INSERT/UPDATE
-- policy for authenticated), same pattern as other sensitive tables;
-- students can only SELECT their own rows and mark them read.

CREATE TABLE public.app_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX app_notifications_user_id_created_at_idx
  ON public.app_notifications (user_id, created_at DESC);

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.app_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own notifications read" ON public.app_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
