-- =====================================================================
-- EventureOS 0084 — Café roster (replaces Deputy): areas, a published weekly roster, availability,
-- leave requests, shift swaps / cover, clock on/off, timesheets, award hours and Xero Payroll.
--   roster_areas         : where people work (Barista, Floor, Kitchen …)
--   staff_shifts         : + area, unpaid break, roster flag, draft until published; can be an open shift (no one yet)
--   staff_availability   : regular weekly availability a staff member sets in the app
--   staff_unavailability : + leave type and approval (a leave request); plain "away" days stay as they are
--   staff_shift_offers   : giving a shift away / asking for cover; someone claims it; the office approves
--   staff_time_entries   : clock on/off (phone or the café iPad), breaks, approval, sent to Xero Payroll
--   public_holidays      : per business (ACT ones added for the first business by hand)
--   crew_members         : + employment type, roster on/off, Xero Payroll employee, café iPad PIN
-- Staff use the app through server code (service role), so these tables are readable by the office only.
-- =====================================================================

create table if not exists public.roster_areas (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  colour          text check (colour ~* '^#[0-9a-f]{6}$'),
  position        integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (id, organisation_id)
);
create index if not exists roster_areas_org on public.roster_areas (organisation_id, position);

alter table public.crew_members add column if not exists employment_type text not null default 'casual' check (employment_type in ('casual','part_time','full_time'));
alter table public.crew_members add column if not exists on_roster boolean not null default false;      -- shows on the café roster
alter table public.crew_members add column if not exists xero_employee_id text;                         -- Xero Payroll employee
alter table public.crew_members add column if not exists kiosk_pin_hash text;                           -- café iPad clock-on PIN (hashed)
alter table public.crew_members add column if not exists default_area_id uuid references public.roster_areas(id) on delete set null;

alter table public.staff_shifts alter column crew_member_id drop not null;                               -- an open shift
alter table public.staff_shifts add column if not exists roster boolean not null default false;
alter table public.staff_shifts add column if not exists area_id uuid references public.roster_areas(id) on delete set null;
alter table public.staff_shifts add column if not exists break_minutes integer not null default 0 check (break_minutes between 0 and 240);
alter table public.staff_shifts add column if not exists published_at timestamptz;                        -- roster shifts: staff see it once published
alter table public.staff_shifts add column if not exists changed_since_publish boolean not null default false;
create index if not exists staff_shifts_roster_week on public.staff_shifts (organisation_id, shift_date) where roster;

create table if not exists public.staff_availability (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  weekday         smallint not null check (weekday between 0 and 6),        -- 0 = Sunday
  available       boolean not null default true,                            -- false = can't work then
  start_time      time,                                                    -- null = all day
  finish_time     time,
  note            text check (char_length(note) <= 200),
  created_at      timestamptz not null default now(),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists staff_availability_member on public.staff_availability (crew_member_id, weekday);

-- A leave request is an away period with a type; it waits for approval. Plain away days (no type) are approved.
alter table public.staff_unavailability add column if not exists leave_type text check (leave_type in ('annual','personal','unpaid','long_service','other'));
alter table public.staff_unavailability add column if not exists status text not null default 'approved' check (status in ('pending','approved','declined'));
alter table public.staff_unavailability add column if not exists hours numeric(6,2) check (hours is null or (hours >= 0 and hours <= 500));
alter table public.staff_unavailability add column if not exists decided_by uuid references public.users(id);
alter table public.staff_unavailability add column if not exists decided_at timestamptz;
alter table public.staff_unavailability add column if not exists decline_reason text check (char_length(decline_reason) <= 300);
alter table public.staff_unavailability add column if not exists xero_leave_id text;

create table if not exists public.staff_shift_offers (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_shift_id  uuid not null references public.staff_shifts(id) on delete cascade,
  from_member_id  uuid not null,
  to_member_id    uuid,                                                    -- asked someone in particular, or who claimed it
  swap_shift_id   uuid references public.staff_shifts(id) on delete set null, -- a swap: the shift they give back
  note            text check (char_length(note) <= 300),
  status          text not null default 'open' check (status in ('open','claimed','approved','declined','cancelled')),
  claimed_at      timestamptz,
  decided_by      uuid references public.users(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (from_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade,
  foreign key (to_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists staff_shift_offers_open on public.staff_shift_offers (organisation_id, status);
create unique index if not exists staff_shift_offers_one_live on public.staff_shift_offers (staff_shift_id) where status in ('open','claimed');

create table if not exists public.staff_time_entries (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  staff_shift_id  uuid references public.staff_shifts(id) on delete set null,
  work_date       date not null,                                           -- the day the shift started (local)
  clock_in        timestamptz not null,
  clock_out       timestamptz,
  break_minutes   integer not null default 0 check (break_minutes between 0 and 600),
  break_started_at timestamptz,                                            -- on a break right now
  source          text not null default 'phone' check (source in ('phone','kiosk','office')),
  in_lat          numeric(9,6), in_lng numeric(9,6), out_lat numeric(9,6), out_lng numeric(9,6),
  note            text check (char_length(note) <= 500),
  -- what's paid: worked times as approved by the office (start from the clock, rounded; the office can change them)
  paid_start      timestamptz,
  paid_finish     timestamptz,
  status          text not null default 'open' check (status in ('open','pending','approved','rejected')),
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  xero_timesheet_id text,
  sent_to_xero_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists staff_time_entries_member on public.staff_time_entries (crew_member_id, work_date desc);
create index if not exists staff_time_entries_org_date on public.staff_time_entries (organisation_id, work_date);
create unique index if not exists staff_time_entries_one_open on public.staff_time_entries (crew_member_id) where clock_out is null;

create table if not exists public.public_holidays (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  holiday_date    date not null,
  name            text not null check (char_length(name) between 1 and 80),
  unique (organisation_id, holiday_date)
);

do $$ declare t text; begin
  foreach t in array array['roster_areas','staff_availability','staff_shift_offers','staff_time_entries','public_holidays'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;
