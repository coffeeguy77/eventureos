-- 0119: Projects — a task's billed hours can be set by hand (e.g. time spent before an AI session that its timestamps
-- don't show). Null = worked out from the recorded hours and the client's margin.
alter table public.nh_project_time add column if not exists billed_hours numeric(7,2) check (billed_hours is null or (billed_hours >= 0 and billed_hours <= 500));
notify pgrst, 'reload schema';
