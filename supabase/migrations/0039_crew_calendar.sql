-- Staff list without logins (casual baristas, rostering admin) + who's working each job,
-- and the extra job details the calendar invite shows (setup time, number of serves).

create table if not exists public.crew_members (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  email           text check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  phone           text check (char_length(phone) <= 40),
  role            text check (char_length(role) <= 60),          -- e.g. Barista, Rosters
  always_invite   boolean not null default false,                  -- on every job's calendar invite
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists crew_members_org_email on public.crew_members (organisation_id, lower(email)) where email is not null;
create index if not exists crew_members_org_idx on public.crew_members (organisation_id, active);
drop trigger if exists crew_members_updated_at on public.crew_members;
create trigger crew_members_updated_at before update on public.crew_members for each row execute function public.set_updated_at();

create table if not exists public.event_crew (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id        uuid not null,
  crew_member_id  uuid not null,
  role            text check (char_length(role) <= 60),
  created_at      timestamptz not null default now(),
  unique (event_id, crew_member_id),
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete cascade,
  foreign key (crew_member_id, organisation_id) references public.crew_members(id, organisation_id) on delete cascade
);
create index if not exists event_crew_event_idx on public.event_crew (event_id);

alter table public.crew_members enable row level security;
alter table public.event_crew enable row level security;
drop policy if exists crew_members_select on public.crew_members;
create policy crew_members_select on public.crew_members for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists crew_members_write on public.crew_members;
create policy crew_members_write on public.crew_members for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists event_crew_select on public.event_crew;
create policy event_crew_select on public.event_crew for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists event_crew_write on public.event_crew;
create policy event_crew_write on public.event_crew for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Job timing: start_time/finish_time are the service window; setup_time is when the team arrives to set up.
alter table public.events add column if not exists setup_time time;
alter table public.events add column if not exists serves integer check (serves is null or serves >= 0);
