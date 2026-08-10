DROP INDEX IF EXISTS public.tasks_google_classroom_id_idx;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_google_classroom_id_key UNIQUE (google_classroom_id);
