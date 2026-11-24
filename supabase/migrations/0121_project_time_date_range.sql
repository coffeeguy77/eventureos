-- 0121: Projects — a task can cover a range of days (work_date to work_date_to), so a long piece of work — the session
-- plus the planning and testing around it — reads "12–14 Nov" on the invoice instead of 24 hours on one day.
alter table public.nh_project_time add column if not exists work_date_to date;
alter table public.nh_project_time drop constraint if exists nh_project_time_date_range;
alter table public.nh_project_time add constraint nh_project_time_date_range check (work_date_to is null or work_date_to >= work_date);
notify pgrst, 'reload schema';
