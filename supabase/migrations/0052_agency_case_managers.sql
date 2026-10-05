-- =====================================================================
-- EventureOS 0052 — Employment agency case managers
--   booking_case_managers          : the agency's staff who book job seekers (picked from a list after the agency code)
--   booking_case_manager_logins    : one-time sign-in links emailed to a case manager (no passwords)
--   booking_case_manager_sessions  : signed-in case managers. scope 'book' = picked their name (can book only);
--                                    scope 'portal' = used an emailed link (can see their job seekers and certificates)
--   bookings.case_manager_id       : which case manager booked it (their job seeker)
--   bookings.case_manager_notified_at, booking_certificates.case_manager_emailed_at : emails sent to the case manager
-- Nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

create table if not exists public.booking_case_managers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  agency_id        uuid not null,
  name             text not null check (char_length(name) between 2 and 160),
  email            text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  phone            text check (char_length(phone) <= 40),
  site             text check (char_length(site) <= 160),
  active           boolean not null default true,
  source           text not null default 'office' check (source in ('office','import','booking','self')),
  last_used_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (agency_id, organisation_id) references public.booking_agencies(id, organisation_id) on delete cascade
);
create unique index if not exists booking_case_managers_email_uq on public.booking_case_managers (agency_id, lower(email));
create index if not exists booking_case_managers_agency_idx on public.booking_case_managers (agency_id, active);

create table if not exists public.booking_case_manager_logins (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  case_manager_id  uuid not null references public.booking_case_managers(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.booking_case_manager_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  case_manager_id  uuid not null references public.booking_case_managers(id) on delete cascade,
  scope            text not null default 'book' check (scope in ('book','portal')),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

alter table public.bookings add column if not exists case_manager_id uuid references public.booking_case_managers(id) on delete set null;
alter table public.bookings add column if not exists case_manager_notified_at timestamptz;
create index if not exists bookings_case_manager_idx on public.bookings (case_manager_id) where case_manager_id is not null;
alter table public.booking_certificates add column if not exists case_manager_emailed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'booking_case_managers_updated_at') then
    create trigger booking_case_managers_updated_at before update on public.booking_case_managers for each row execute function public.set_updated_at();
  end if;
end $$;

-- Office team can see case managers; managers can edit. Sign-in tables are server-only.
alter table public.booking_case_managers enable row level security;
drop policy if exists booking_case_managers_select on public.booking_case_managers;
create policy booking_case_managers_select on public.booking_case_managers for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists booking_case_managers_write on public.booking_case_managers;
create policy booking_case_managers_write on public.booking_case_managers for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
alter table public.booking_case_manager_logins enable row level security;
alter table public.booking_case_manager_sessions enable row level security;
