CREATE TABLE public.google_classroom_connections (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);
ALTER TABLE public.google_classroom_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classroom connection" ON public.google_classroom_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.classroom_courses (
  id TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  section TEXT,
  room TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classroom_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classroom courses" ON public.classroom_courses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.classroom_coursework (
  id TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  max_points NUMERIC,
  assigned_grade NUMERIC,
  submission_state TEXT,
  work_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classroom_coursework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classroom coursework" ON public.classroom_coursework
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.classroom_announcements (
  id TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.classroom_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classroom announcements" ON public.classroom_announcements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.classroom_materials (
  id TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.classroom_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.classroom_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classroom materials" ON public.classroom_materials
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'clearpath';
ALTER TABLE public.tasks ADD COLUMN google_classroom_id TEXT;
CREATE UNIQUE INDEX tasks_google_classroom_id_idx ON public.tasks (google_classroom_id)
  WHERE google_classroom_id IS NOT NULL;
