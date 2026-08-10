CREATE TABLE IF NOT EXISTS public.teacher_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  coursework_id TEXT,
  teacher_email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
ALTER TABLE public.teacher_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own teacher comments" ON public.teacher_comments;
CREATE POLICY "Users see own teacher comments" ON public.teacher_comments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users mark own teacher comments read" ON public.teacher_comments;
CREATE POLICY "Users mark own teacher comments read" ON public.teacher_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
