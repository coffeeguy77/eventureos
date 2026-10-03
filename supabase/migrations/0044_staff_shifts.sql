-- =====================================================================
-- EventureOS 0044 — Shifts that aren't event shifts, regular weekly shifts, extra staff emails
--   staff_shift_series : a regular shift (e.g. coffee delivery every Thursday 7–11am)
--   staff_shifts       : one-off or generated shifts for one staff member — paid like event shifts,
--                        shown in the staff app and sent to their Google Calendar
--   crew_member_emails : extra email addresses a staff member can sign in with
-- =====================================================================

create table if not exists public.crew_member_emails (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  email           text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  created_at      timestamptz not null default now(),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create unique index if not exists crew_member_emails_org_email on public.crew_member_emails (organisation_id, lower(email));

create table if not exists public.staff_shift_series (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  title           text not null check (char_length(title) between 1 and 120),
  weekday         smallint not null check (weekday between 0 and 6),        -- 0 = Sunday
  every_weeks     smallint not null default 1 check (every_weeks between 1 and 8),
  start_time      time not null,
  finish_time     time not null,
  location        text check (char_length(location) <= 300),
  notes           text check (char_length(notes) <= 2000),
  starts_on       date not null,
  ends_on         date,
  skip_dates      date[] not null default '{}',                           -- occurrences removed by the office
  active          boolean not null default true,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);

alter table public.staff_shift_series add column if not exists skip_dates date[] not null default '{}';

create table if not exists public.staff_shifts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  title           text not null check (char_length(title) between 1 and 120),
  shift_date      date not null,
  start_time      time,
  finish_time     time,
  location        text check (char_length(location) <= 300),
  notes           text check (char_length(notes) <= 2000),
  series_id       uuid references public.staff_shift_series(id) on delete set null,
  source_calendar_event_id uuid references public.calendar_events(id) on delete set null, -- made from a Google Calendar booking
  hours_override  numeric(6,2) check (hours_override is null or (hours_override >= 0 and hours_override <= 48)),
  rate_override   numeric(8,2) check (rate_override is null or rate_override >= 0),
  payment_id      uuid references public.staff_payments(id) on delete set null,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create unique index if not exists staff_shifts_series_date on public.staff_shifts (series_id, shift_date) where series_id is not null;
create index if not exists staff_shifts_member_idx on public.staff_shifts (crew_member_id, shift_date);
create index if not exists staff_shifts_org_date_idx on public.staff_shifts (organisation_id, shift_date);
drop trigger if exists staff_shifts_updated_at on public.staff_shifts;
create trigger staff_shifts_updated_at before update on public.staff_shifts for each row execute function public.set_updated_at();

-- Extra-hours requests can be for either kind of shift
alter table public.staff_hour_claims alter column event_crew_id drop not null;
alter table public.staff_hour_claims add column if not exists staff_shift_id uuid references public.staff_shifts(id) on delete cascade;
do $$ begin
  alter table public.staff_hour_claims add constraint staff_hour_claims_one_shift check ((event_crew_id is null) <> (staff_shift_id is null));
exception when duplicate_object then null; end $$;

-- Shifts go to the staff member's Google Calendar
alter table public.calendar_events add column if not exists staff_shift_id uuid references public.staff_shifts(id) on delete cascade;
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check
  check (kind in ('event','site_visit','setup','hold','other','task','shift'));

alter table public.crew_member_emails enable row level security;
alter table public.staff_shift_series enable row level security;
alter table public.staff_shifts enable row level security;
do $$ declare t text; begin
  foreach t in array array['crew_member_emails','staff_shift_series','staff_shifts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;
