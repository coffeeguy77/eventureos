-- To-do list + calendar reminders for follow-ups.
-- 1) Calendar entries can be a "task" reminder, linked to the task it reminds about.
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check
  check (kind in ('event','site_visit','setup','hold','other','task'));
alter table public.calendar_events add column if not exists task_id uuid references public.tasks(id) on delete cascade;
create index if not exists calendar_events_task_idx on public.calendar_events (task_id) where task_id is not null;

-- 2) Where a task came from (typed in, suggested automatically, or prepared by the assistant), and notes on it.
alter table public.tasks add column if not exists source text not null default 'manual'
  check (source in ('manual','auto','assistant'));
-- Stops the same automatic follow-up being added twice (e.g. "chase quote Q-1007")
alter table public.tasks add column if not exists auto_key text;
create unique index if not exists tasks_auto_key_uq on public.tasks (organisation_id, auto_key) where auto_key is not null;
