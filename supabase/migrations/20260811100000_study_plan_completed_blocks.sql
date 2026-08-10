-- Tracks which individual suggested time blocks within a study plan the
-- student has checked off, so progress survives reloads. Identified by the
-- block's own text (scoped per plan, reset whenever the plan is
-- regenerated) rather than a separate normalized table, since plans are
-- free-form AI-generated markdown, not a fixed schema.

ALTER TABLE public.study_plans
  ADD COLUMN completed_blocks text[] NOT NULL DEFAULT '{}';
