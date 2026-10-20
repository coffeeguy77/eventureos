-- =====================================================================
-- 0061_kitchen_salary_catering_days.sql
--
-- 1. crew_members.salaried : on salary — no hourly pay is worked out for their shifts.
-- 2. crew_members.skills   : (also in 0059) what each person does — now including "kitchen" (the chef).
-- 3. events.catering_days  : catering split over the job's days — which day each item goes out, and the delivery time.
--      { "days": [{ "date": "2026-10-22", "time": "07:00" }, …], "qty": { "<service id>": { "2026-10-22": 30, … } } }
-- 4. events.catering_sent  : what the kitchen was last told about this job (so changes can be sent to the chef).
-- Adds columns only; nothing is removed. Safe to run more than once.
-- =====================================================================

alter table public.crew_members add column if not exists salaried boolean not null default false;
alter table public.crew_members add column if not exists skills text[] not null default '{}';

alter table public.events add column if not exists catering_days jsonb not null default '{}'::jsonb;
alter table public.events add column if not exists catering_sent jsonb;
