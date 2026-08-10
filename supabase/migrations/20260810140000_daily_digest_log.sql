-- Tracks which users have already received a daily task-reminder email for
-- a given date, so the cron job (which may run more than once, or be
-- retried) never double-sends. RLS is enabled with no policies for the
-- authenticated/anon roles -- only the service role (used exclusively by
-- the /api/notifications/daily-digest cron route) can read or write this.

CREATE TABLE public.daily_digest_log (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_for_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sent_for_date)
);

ALTER TABLE public.daily_digest_log ENABLE ROW LEVEL SECURITY;
