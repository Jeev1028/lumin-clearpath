CREATE TYPE public.task_kind AS ENUM ('test','assignment','project','reading');
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','submitted');

CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  course TEXT,
  kind public.task_kind NOT NULL DEFAULT 'assignment',
  status public.task_status NOT NULL DEFAULT 'todo',
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own tasks" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.schedule_category AS ENUM ('weekday','weekend','extracurricular','holiday');

CREATE TABLE public.schedule_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  category public.schedule_category NOT NULL DEFAULT 'weekday',
  day_of_week SMALLINT NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '10:00',
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_events TO authenticated;
GRANT ALL ON public.schedule_events TO service_role;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own schedule" ON public.schedule_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedule_events_updated_at BEFORE UPDATE ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();