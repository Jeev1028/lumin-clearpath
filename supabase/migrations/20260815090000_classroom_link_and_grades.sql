-- Google Classroom's own "alternateLink" for each coursework item -- the
-- direct URL to the assignment inside real Google Classroom. Kept as a
-- guaranteed-working fallback for turning work in, since some school
-- Google Workspace domains block third-party apps (like ClearPath) from
-- calling the Classroom API's write endpoints (turnIn/reclaim) even when
-- the student has personally granted the right OAuth scope -- that's a
-- domain-level "API access control" restriction only the school's
-- Workspace admin can lift, not something fixable in this app.
ALTER TABLE public.classroom_coursework ADD COLUMN IF NOT EXISTS alternate_link TEXT;

-- Mirror the same link, plus grade fields, onto tasks so the assignment's
-- detail view can show a grade and a "view in Google Classroom" link
-- regardless of whether it was opened from /tasks or /classroom.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS alternate_link TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_grade NUMERIC;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS max_points NUMERIC;
