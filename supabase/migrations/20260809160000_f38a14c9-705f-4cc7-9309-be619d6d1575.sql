-- Google Calendar two-way sync support.

-- Weekly template events (schedule_events) can be linked to a recurring
-- Google Calendar event so repeat syncs update in place instead of
-- duplicating.
ALTER TABLE public.schedule_events ADD COLUMN google_event_id TEXT;
CREATE UNIQUE INDEX schedule_events_user_google_event_id_key
  ON public.schedule_events (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- One connection per user. Tokens are encrypted application-side before
-- being written here; only the server (service role) may write to this
-- table — the client can only read its own row (e.g. to show connection
-- status), never the token columns' plaintext since they're ciphertext.
CREATE TABLE public.google_calendar_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);
GRANT SELECT ON public.google_calendar_connections TO authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own calendar connection" ON public.google_calendar_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- One-off dated events (distinct from the weekly schedule_events
-- template). Users can create these directly (source = 'clearpath') or
-- they arrive from a Google Calendar sync (source = 'google').
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  google_event_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'clearpath' CHECK (source IN ('clearpath', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX calendar_events_user_google_event_id_key
  ON public.calendar_events (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own calendar events" ON public.calendar_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
