ALTER TABLE public.classroom_coursework DROP CONSTRAINT IF EXISTS classroom_coursework_course_id_fkey;
ALTER TABLE public.classroom_announcements DROP CONSTRAINT IF EXISTS classroom_announcements_course_id_fkey;
ALTER TABLE public.classroom_materials DROP CONSTRAINT IF EXISTS classroom_materials_course_id_fkey;

ALTER TABLE public.classroom_courses DROP CONSTRAINT IF EXISTS classroom_courses_pkey;
ALTER TABLE public.classroom_courses ADD PRIMARY KEY (id, user_id);

ALTER TABLE public.classroom_coursework DROP CONSTRAINT IF EXISTS classroom_coursework_pkey;
ALTER TABLE public.classroom_coursework ADD PRIMARY KEY (id, user_id);

ALTER TABLE public.classroom_announcements DROP CONSTRAINT IF EXISTS classroom_announcements_pkey;
ALTER TABLE public.classroom_announcements ADD PRIMARY KEY (id, user_id);

ALTER TABLE public.classroom_materials DROP CONSTRAINT IF EXISTS classroom_materials_pkey;
ALTER TABLE public.classroom_materials ADD PRIMARY KEY (id, user_id);

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_google_classroom_id_key;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_classroom_unique UNIQUE (user_id, google_classroom_id);
