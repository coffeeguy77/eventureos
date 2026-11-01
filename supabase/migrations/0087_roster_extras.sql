-- =====================================================================
-- EventureOS 0087 — café roster extras
--   staff_late_alerts      : the "running late?" text for a rostered shift (sent automatically or by a manager)
--   staff_shifts.reminder_sent_at : the shift reminder text went out
--   roster_checklists      : opening / closing / area checklists (items), ticked on the iPad or in the staff app
--   roster_checklist_ticks : who ticked which item, which day
--   staff_qualifications   : RSA, food safety, first aid, visa… with expiry dates and an optional file (private bucket staff-docs)
--   roster_areas.required_quals : qualifications needed to work an area (the roster warns)
--   staff_notes            : managers' private notes about a staff member (training, breaks…)
--   staff_payslips         : payslips read from Xero Payroll, shown to each person in the staff app
--   staff_bank_accounts    : bank details for people paid through Wages (the ABA bank file) — managers only
-- =====================================================================

create table if not exists public.staff_late_alerts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_shift_id  uuid not null references public.staff_shifts(id) on delete cascade,
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  sent_at         timestamptz not null default now(),
  sent_by         text not null default 'auto',   -- 'auto' or the manager's name
  ok              boolean not null default true,
  error           text
);
create index if not exists staff_late_alerts_shift on public.staff_late_alerts (staff_shift_id, sent_at desc);

alter table public.staff_shifts add column if not exists reminder_sent_at timestamptz;

create table if not exists public.roster_checklists (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  area_id         uuid references public.roster_areas(id) on delete set null,
  weekdays        smallint[] not null default '{0,1,2,3,4,5,6}',
  due_by          time,                                   -- e.g. 07:00 for opening
  items           text[] not null default '{}',
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create table if not exists public.roster_checklist_ticks (
  checklist_id    uuid not null references public.roster_checklists(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  day             date not null,
  item            smallint not null,
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  ticked_at       timestamptz not null default now(),
  primary key (checklist_id, day, item)
);

create table if not exists public.staff_qualifications (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  reference       text,
  expires_on      date,
  file_path       text,
  created_at      timestamptz not null default now()
);
create index if not exists staff_qualifications_member on public.staff_qualifications (crew_member_id);
alter table public.roster_areas add column if not exists required_quals text[] not null default '{}';

create table if not exists public.staff_notes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  author_id       uuid references auth.users(id) on delete set null,
  author_name     text,
  created_at      timestamptz not null default now()
);
create index if not exists staff_notes_member on public.staff_notes (crew_member_id, created_at desc);

create table if not exists public.staff_payslips (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid references public.crew_members(id) on delete cascade,
  xero_employee_id text not null,
  xero_payslip_id text not null unique,
  period_start    date,
  period_end      date,
  paid_on         date,
  gross           numeric(12,2),
  tax             numeric(12,2),
  super           numeric(12,2),
  net             numeric(12,2),
  lines           jsonb not null default '[]'::jsonb,
  fetched_at      timestamptz not null default now()
);
create index if not exists staff_payslips_member on public.staff_payslips (crew_member_id, paid_on desc);

create table if not exists public.staff_bank_accounts (
  crew_member_id  uuid primary key references public.crew_members(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  account_name    text not null check (char_length(account_name) between 1 and 32),
  bsb             text not null check (bsb ~ '^\d{3}-?\d{3}$'),
  account_number  text not null check (account_number ~ '^\d{4,9}$'),
  updated_at      timestamptz not null default now()
);

-- the office reads / writes (staff use these through server code)
do $$
declare t text;
begin
  foreach t in array array['staff_late_alerts', 'roster_checklists', 'roster_checklist_ticks', 'staff_qualifications', 'staff_payslips'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
  -- private: managers only, even for reading
  foreach t in array array['staff_notes', 'staff_bank_accounts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;

-- staff documents (certificates): private; managers read through short-lived links
insert into storage.buckets (id, name, public, file_size_limit)
values ('staff-docs', 'staff-docs', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
drop policy if exists "staff-docs: managers read" on storage.objects;
create policy "staff-docs: managers read" on storage.objects for select to authenticated
  using (bucket_id = 'staff-docs' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));

-- one automatic late text per shift (managers can send more)
create unique index if not exists staff_late_alerts_auto_once on public.staff_late_alerts (staff_shift_id) where sent_by = 'auto';
