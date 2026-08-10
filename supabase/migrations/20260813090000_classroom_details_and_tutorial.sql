ALTER TABLE public.classroom_courses ADD COLUMN teacher_email TEXT;
ALTER TABLE public.classroom_coursework ADD COLUMN materials JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.classroom_coursework ADD COLUMN rubric JSONB;
ALTER TABLE public.tasks ADD COLUMN description TEXT;
ALTER TABLE public.tasks ADD COLUMN materials JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.tasks ADD COLUMN rubric JSONB;
ALTER TABLE public.tasks ADD COLUMN classroom_course_id TEXT;

CREATE TABLE public.teacher_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  coursework_id TEXT,
  teacher_email TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own teacher messages" ON public.teacher_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
