ALTER TABLE public.classroom_coursework ADD COLUMN IF NOT EXISTS student_work JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS student_work JSONB NOT NULL DEFAULT '[]';
