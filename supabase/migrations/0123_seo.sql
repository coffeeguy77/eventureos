-- =====================================================================
-- EventureOS 0123 — Nerd Herd SEO + AI search (Web Culture Connector 1.5.0)
--   nh_seo_sites  one row per website: score, site checks, linked Search Console property and its latest figures,
--                 whether the weekly automatic run is on, and where a run got to.
--   nh_seo_pages  the latest audit of each public page (score, issues, what search engines and AI tools read).
--   nh_seo_runs   history: audits, AI fixes, AI search pack, Search Console refreshes — with cost and the changes made.
--   Weekly: pg_cron wakes /api/cron/seo (same Vault secret as the sync), which audits each connected site, applies the
--   AI search pack and AI fixes on the sites set to automatic, and refreshes Search Console figures.
--   website_maintenance_runs gains the 'seo' action so clients see the SEO work in their maintenance history.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.nh_seo_sites (
  website_id       uuid primary key,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  auto             boolean not null default true,
  gsc_site         text,
  score            integer,
  pages            integer not null default 0,
  issues           integer not null default 0,
  checks           jsonb,
  gsc              jsonb,
  status           text not null default 'idle' check (status in ('idle', 'auditing', 'fixing')),
  audit_offset     integer,
  last_audit_at    timestamptz,
  last_fix_at      timestamptz,
  last_pack_at     timestamptz,
  last_gsc_at      timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id) on delete cascade
);
create index if not exists nh_seo_sites_org on public.nh_seo_sites (organisation_id);

create table if not exists public.nh_seo_pages (
  website_id       uuid not null,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  post_id          integer not null,
  url              text not null,
  name             text,
  type             text,
  front            boolean not null default false,
  score            integer,
  issues           jsonb not null default '[]'::jsonb,
  data             jsonb,
  gsc              jsonb,
  fixed_at         timestamptz,
  audited_at       timestamptz not null default now(),
  primary key (website_id, post_id),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id) on delete cascade
);
create index if not exists nh_seo_pages_org on public.nh_seo_pages (organisation_id);

create table if not exists public.nh_seo_runs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  website_id       uuid not null,
  kind             text not null check (kind in ('audit', 'fix', 'pack', 'gsc', 'settings')),
  ok               boolean not null default true,
  summary          text,
  changes          jsonb not null default '[]'::jsonb,
  cost_usd         numeric(10, 4) not null default 0,
  actor            uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (website_id, organisation_id) references public.websites(id, organisation_id) on delete cascade
);
create index if not exists nh_seo_runs_site on public.nh_seo_runs (website_id, created_at desc);
create index if not exists nh_seo_runs_org_month on public.nh_seo_runs (organisation_id, created_at);

-- Staff read; only the server (service role) writes
alter table public.nh_seo_sites enable row level security;
alter table public.nh_seo_pages enable row level security;
alter table public.nh_seo_runs enable row level security;
drop policy if exists nh_seo_sites_staff_select on public.nh_seo_sites;
create policy nh_seo_sites_staff_select on public.nh_seo_sites for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists nh_seo_pages_staff_select on public.nh_seo_pages;
create policy nh_seo_pages_staff_select on public.nh_seo_pages for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists nh_seo_runs_staff_select on public.nh_seo_runs;
create policy nh_seo_runs_staff_select on public.nh_seo_runs for select to authenticated using (public.is_org_staff(organisation_id));
revoke insert, update, delete on public.nh_seo_sites, public.nh_seo_pages, public.nh_seo_runs from anon, authenticated;

-- Clients see SEO work in their maintenance history
alter table public.website_maintenance_runs drop constraint if exists website_maintenance_runs_action_check;
alter table public.website_maintenance_runs add constraint website_maintenance_runs_action_check
  check (action in ('connect', 'check', 'update', 'purge', 'disconnect', 'lock', 'unlock', 'login', 'other', 'ai', 'backup', 'content', 'restore', 'seo'));

-- Weekly automatic run (Mondays 4am Canberra ≈ Sunday 17:00 UTC)
create or replace function public.nh_seo_kick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then return null; end if;
  return net.http_post(
    url := 'https://www.eventureos.com.au/api/cron/seo',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.nh_seo_kick() from public, anon, authenticated;
grant execute on function public.nh_seo_kick() to service_role;

do $$ begin
  perform cron.unschedule('nh-seo-weekly') where exists (select 1 from cron.job where jobname = 'nh-seo-weekly');
  -- every 20 minutes on Monday morning (UTC Sunday evening): each wake carries on where the last one stopped
  perform cron.schedule('nh-seo-weekly', '*/20 17-20 * * 0', 'select public.nh_seo_kick()');
end $$;
