CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own group memberships" ON public.group_members
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.notices ADD COLUMN group_ids UUID[] DEFAULT NULL;

DROP POLICY "Anyone can read active notices" ON public.notices;
CREATE POLICY "Anyone can read active notices" ON public.notices
  FOR SELECT
  USING (
    active = true
    AND (
      group_ids IS NULL
      OR array_length(group_ids, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.user_id = auth.uid() AND gm.group_id = ANY(notices.group_ids)
      )
    )
  );

ALTER TABLE public.admins ADD COLUMN can_manage_groups BOOLEAN NOT NULL DEFAULT false;
