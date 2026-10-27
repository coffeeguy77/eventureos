-- 0074 — Hosting (Web Culture): hosting servers (WHM, SiteGround), the hosting accounts on them, their billing
-- state against invoices, and a log of every check, notice, suspend and unsuspend.
-- Server API tokens live in hosting_server_credentials, which only the server (service key) can read.

create table if not exists public.hosting_servers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null,
  kind             text not null default 'whm' check (kind in ('whm','siteground')),
  host             text,
  port             integer not null default 2087,
  username         text,
  verify_tls       boolean not null default true,
  active           boolean not null default true,
  last_sync_at     timestamptz,
  last_sync_status text,
  last_error       text,
  account_count    integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists hosting_servers_org on public.hosting_servers (organisation_id);

create table if not exists public.hosting_server_credentials (
  server_id   uuid primary key references public.hosting_servers(id) on delete cascade,
  token       text not null,
  updated_at  timestamptz not null default now()
);
alter table public.hosting_server_credentials enable row level security;
revoke all on public.hosting_server_credentials from anon, authenticated;

create table if not exists public.hosting_accounts (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  server_id           uuid not null references public.hosting_servers(id) on delete cascade,
  domain              text not null,
  username            text,                                  -- cPanel user (WHM)
  plan                text,
  server_email        text,                                  -- contact email on the server
  owner               text,
  disk_used_mb        numeric,
  disk_limit_mb       numeric,
  on_server           boolean not null default true,         -- still listed by the server at the last sync
  suspended           boolean not null default false,
  suspend_reason      text,
  suspended_by_app    boolean not null default false,
  suspension_category text,                                  -- billing_overdue | other
  suspended_at        timestamptz,
  customer_id         uuid,
  contact_email       text,                                  -- notices go here first
  cc_emails           text[] not null default '{}',
  billing_reference   text,
  vip                 boolean not null default false,
  disputed            boolean not null default false,
  manual_override     boolean not null default false,
  extension_until     date,
  auto_check          boolean not null default true,
  auto_unsuspend      boolean not null default true,
  billing_status      text,
  match_status        text,
  match_reason        text,
  invoice_id          uuid references public.invoices(id) on delete set null,
  amount_due          numeric(12,2),
  due_date            date,
  days_overdue        integer,
  billing_checked_at  timestamptz,
  last_notice_at      timestamptz,
  last_notice_type    text,
  site_key            text not null default replace(gen_random_uuid()::text, '-', ''),  -- SiteGround plugin key
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);
create unique index if not exists hosting_accounts_user on public.hosting_accounts (server_id, username) where username is not null;
create unique index if not exists hosting_accounts_domain on public.hosting_accounts (server_id, domain);
create unique index if not exists hosting_accounts_key on public.hosting_accounts (site_key);
create index if not exists hosting_accounts_org on public.hosting_accounts (organisation_id, billing_status);

create table if not exists public.hosting_events (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid references public.hosting_accounts(id) on delete cascade,
  server_id        uuid references public.hosting_servers(id) on delete set null,
  action           text not null,                          -- sync, check, notice, suspend, unsuspend, auto_*, setting
  ok               boolean not null default true,
  dry_run          boolean not null default false,
  detail           text,
  actor            uuid,
  created_at       timestamptz not null default now()
);
create index if not exists hosting_events_account on public.hosting_events (account_id, created_at desc);
create index if not exists hosting_events_org on public.hosting_events (organisation_id, created_at desc);

alter table public.hosting_servers enable row level security;
alter table public.hosting_accounts enable row level security;
alter table public.hosting_events enable row level security;
do $$ declare t text; begin
  foreach t in array array['hosting_servers','hosting_accounts','hosting_events'] loop
    execute format('drop policy if exists %1$s_staff on public.%1$s', t);
    execute format('create policy %1$s_staff on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;
