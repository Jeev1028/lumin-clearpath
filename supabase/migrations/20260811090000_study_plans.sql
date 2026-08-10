-- Stores each student's most recently generated Lumin study plan (one row
-- per user, overwritten on regenerate) so it persists across visits to the
-- Tasks/Schedule pages instead of needing to be regenerated every time.

CREATE TABLE public.study_plans (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL DEFAULT 'week',
  preferences TEXT,
  plan_markdown TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plans TO authenticated;
GRANT ALL ON public.study_plans TO service_role;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study plan" ON public.study_plans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
