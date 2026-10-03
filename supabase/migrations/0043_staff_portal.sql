-- =====================================================================
-- EventureOS 0043 — Staff app (baristas / casual crew)
--   * shifts have a status: interested (put their hand up for a TBC job), offered (rostered, waiting
--     for them to accept), confirmed (accepted — in the app or on the Google Calendar invite)
--   * pay: default hourly rate per organisation, per-person rate, per-shift override; planned hours
--     are setup → finish, plus extra hours the staff member claims (with a reason) once approved
--   * staff payments (marked paid by the office), unavailability, a job board to give a shift away
--   * staff ranking: when a TBC job is confirmed, the best-ranked interested staff get it first
-- Staff use the app through server code (service role) after their emailed sign-in code is checked,
-- so these tables are only readable by the office team directly.
-- =====================================================================

alter table public.organisations add column if not exists staff_hourly_rate numeric(8,2) not null default 30 check (staff_hourly_rate >= 0);

alter table public.crew_members add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.crew_members add column if not exists hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate >= 0);
alter table public.crew_members add column if not exists rank integer not null default 100;
alter table public.crew_members add column if not exists app_invited_at timestamptz;
alter table public.crew_members add column if not exists app_last_seen_at timestamptz;
create index if not exists crew_members_user_idx on public.crew_members (user_id);

-- How many staff the job needs (null = 1), and notes only staff see
alter table public.events add column if not exists crew_needed integer check (crew_needed is null or crew_needed between 0 and 50);
alter table public.events add column if not exists crew_notes text check (char_length(crew_notes) <= 4000);

alter table public.event_crew add column if not exists status text not null default 'offered' check (status in ('interested','offered','confirmed'));
alter table public.event_crew add column if not exists responded_at timestamptz;
alter table public.event_crew add column if not exists calendar_response text check (calendar_response in ('needsAction','accepted','declined','tentative'));
alter table public.event_crew add column if not exists calendar_response_at timestamptz;
alter table public.event_crew add column if not exists rate_override numeric(8,2) check (rate_override is null or rate_override >= 0);
alter table public.event_crew add column if not exists hours_override numeric(6,2) check (hours_override is null or (hours_override >= 0 and hours_override <= 48));
alter table public.event_crew add column if not exists board_posted_at timestamptz;
alter table public.event_crew add column if not exists board_note text check (char_length(board_note) <= 300);
alter table public.event_crew add column if not exists payment_id uuid;
create index if not exists event_crew_member_idx on public.event_crew (crew_member_id, status);

create table if not exists public.staff_payments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  paid_on         date not null,
  hours           numeric(8,2) not null default 0,
  amount          numeric(10,2) not null check (amount >= 0),
  reference       text check (char_length(reference) <= 120),
  note            text check (char_length(note) <= 500),
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists staff_payments_member_idx on public.staff_payments (crew_member_id, paid_on desc);
do $$ begin
  alter table public.event_crew add constraint event_crew_payment_fk foreign key (payment_id) references public.staff_payments(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.staff_hour_claims (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_crew_id   uuid not null references public.event_crew(id) on delete cascade,
  hours           numeric(5,2) not null check (hours > 0 and hours <= 24),
  reason          text not null check (char_length(reason) between 3 and 500),
  status          text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by      uuid references public.users(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists staff_hour_claims_shift_idx on public.staff_hour_claims (event_crew_id);
create index if not exists staff_hour_claims_pending_idx on public.staff_hour_claims (organisation_id) where status = 'pending';

create table if not exists public.staff_unavailability (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  crew_member_id  uuid not null,
  starts_on       date not null,
  ends_on         date not null,
  note            text check (char_length(note) <= 300),
  created_at      timestamptz not null default now(),
  check (ends_on >= starts_on),
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists staff_unavailability_member_idx on public.staff_unavailability (crew_member_id, starts_on);

alter table public.staff_payments enable row level security;
alter table public.staff_hour_claims enable row level security;
alter table public.staff_unavailability enable row level security;
do $$ declare t text; begin
  foreach t in array array['staff_payments','staff_hour_claims','staff_unavailability'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- When a job becomes confirmed: give it to the best-ranked staff who put their hand up,
-- skipping anyone already working an overlapping confirmed job that day or marked away.
-- ---------------------------------------------------------------------
create or replace function public.crew_allocate(p_event uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e record; v_need integer; v_have integer; v_given integer := 0; c record;
  e_start time; e_end time;
begin
  select * into e from public.events where id = p_event;
  if e is null or e.status <> 'confirmed' then return 0; end if;
  v_need := coalesce(e.crew_needed, 1);
  select count(*) into v_have from public.event_crew where event_id = p_event and status in ('offered','confirmed');
  if v_have >= v_need then return 0; end if;
  e_start := coalesce(e.setup_time, e.start_time); e_end := e.finish_time;
  for c in
    select ec.id, ec.crew_member_id from public.event_crew ec
    join public.crew_members m on m.id = ec.crew_member_id and m.active
    where ec.event_id = p_event and ec.status = 'interested'
    order by m.rank, ec.created_at
  loop
    exit when v_have >= v_need;
    -- away that day?
    if e.event_date is not null and exists (select 1 from public.staff_unavailability u where u.crew_member_id = c.crew_member_id and e.event_date between u.starts_on and u.ends_on) then continue; end if;
    -- already on an overlapping confirmed job that day?
    if e.event_date is not null and exists (
      select 1 from public.event_crew o join public.events oe on oe.id = o.event_id
      where o.crew_member_id = c.crew_member_id and o.event_id <> p_event and o.status in ('offered','confirmed')
        and oe.status <> 'cancelled' and oe.event_date = e.event_date
        and (e_start is null or e_end is null or coalesce(oe.setup_time, oe.start_time) is null or oe.finish_time is null
             or (e_start < oe.finish_time and coalesce(oe.setup_time, oe.start_time) < e_end))
    ) then continue; end if;
    update public.event_crew set status = 'confirmed', responded_at = now() where id = c.id;
    v_have := v_have + 1; v_given := v_given + 1;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, event_id, customer_id, summary)
    select e.organisation_id, 'system', 'Staff allocation', 'event.crew_allocated', 'event', e.id, e.id, e.customer_id,
           m.name || ' got the shift on ' || e.name || ' (had put their hand up while it was TBC)'
    from public.crew_members m where m.id = c.crew_member_id;
  end loop;
  if v_given > 0 then
    update public.calendar_events set sync_status = 'pending' where event_id = p_event and kind = 'event' and sync_status <> 'local';
  end if;
  return v_given;
end $$;
revoke all on function public.crew_allocate(uuid) from public, anon;
grant execute on function public.crew_allocate(uuid) to authenticated;

create or replace function public.crew_allocate_on_confirm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed' or new.crew_needed is distinct from old.crew_needed) then
    perform public.crew_allocate(new.id);
  end if;
  return new;
end $$;
drop trigger if exists events_crew_allocate on public.events;
create trigger events_crew_allocate after update of status, crew_needed on public.events
  for each row execute function public.crew_allocate_on_confirm();
