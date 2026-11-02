-- 0093 — Nerd Herd: WordPress command ops through the Web Culture Connector plugin.
--   website_connectors        — one per website: where the site is and its latest status (versions, updates waiting,
--                               plugin/theme lists, health). Staff can read; only the server writes.
--   website_connector_keys    — the site's connection key. Server only (no access for signed-in users), like
--                               hosting_server_credentials. Never sent to the browser.
--   website_maintenance_runs  — history of checks, updates and cache purges run from EventureOS.
-- Additive only. Safe to run more than once.

create table if not exists public.website_connectors (
  website_id        uuid primary key,
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  site_url          text not null,
  connector_version text,
  wp_version        text,
  wp_update         text,
  php_version       text,
  wc_version        text,
  currency          text,
  updates_core      integer not null default 0,
  updates_plugins   integer not null default 0,
  updates_themes    integer not null default 0,
  plugins           jsonb not null default '[]'::jsonb,
  themes            jsonb not null default '[]'::jsonb,
  environment       jsonb,
  health            jsonb,
  last_checked_at   timestamptz,
  last_error        text,
  last_run_at       timestamptz,
  last_run_summary  text,
  last_run_ok       boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id) on delete cascade
);
create index if not exists website_connectors_org on public.website_connectors (organisation_id);
alter table public.website_connectors enable row level security;
drop policy if exists website_connectors_staff_select on public.website_connectors;
create policy website_connectors_staff_select on public.website_connectors for select to authenticated
  using (public.is_org_staff(organisation_id));
revoke insert, update, delete on public.website_connectors from anon, authenticated;

create table if not exists public.website_connector_keys (
  website_id  uuid primary key references public.website_connectors(website_id) on delete cascade,
  key         text not null,
  updated_at  timestamptz not null default now()
);
alter table public.website_connector_keys enable row level security;
revoke all on public.website_connector_keys from anon, authenticated;

create table if not exists public.website_maintenance_runs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  website_id       uuid not null,
  action           text not null check (action in ('connect','check','update','purge','disconnect')),
  scope            text,
  ok               boolean not null default true,
  summary          text,
  detail           jsonb,
  actor            uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id) on delete cascade
);
create index if not exists website_maintenance_runs_site on public.website_maintenance_runs (website_id, created_at desc);
alter table public.website_maintenance_runs enable row level security;
drop policy if exists website_maintenance_runs_staff_select on public.website_maintenance_runs;
create policy website_maintenance_runs_staff_select on public.website_maintenance_runs for select to authenticated
  using (public.is_org_staff(organisation_id));
revoke insert, update, delete on public.website_maintenance_runs from anon, authenticated;
