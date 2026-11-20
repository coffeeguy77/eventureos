-- Marketing (Web Culture add-on): Google Ads, GA4 and Search Console for clients, an AI optimiser that adjusts
-- Google Ads within hard limits, a log of every change (with undo) and monthly client reports.
-- Run in Supabase → SQL editor. Safe to run more than once.

-- One row per client being managed. The Google login that reaches their accounts is the business's
-- "google_marketing" integration (usually a Web Culture manager account with the client linked under it).
create table if not exists public.mk_accounts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  name             text not null,
  ads_customer_id  text check (ads_customer_id is null or ads_customer_id ~ '^[0-9]{10}$'),  -- 10 digits, no dashes
  ads_currency     text,
  ga4_property     text check (ga4_property is null or ga4_property ~ '^properties/[0-9]+$'),
  gsc_site         text,                       -- e.g. "sc-domain:beanculture.com.au" or "https://www.beanculture.com.au/"
  -- AI: auto = apply changes within the limits; suggest = list them for approval; off = report only
  mode             text not null default 'auto' check (mode in ('auto', 'suggest', 'off')),
  monthly_cap      numeric(12,2) check (monthly_cap is null or monthly_cap > 0),  -- no changes are applied without one
  target_cpa       numeric(12,2),              -- optional: the cost per conversion the client is happy with
  goals            text,                       -- what the client wants from Ads, in plain words (the AI reads this)
  max_changes      int not null default 10 check (max_changes between 1 and 50),
  report_to        text[] not null default '{}',
  active           boolean not null default true,
  last_synced_at   timestamptz,
  last_run_at      timestamptz,
  last_error       text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists mk_accounts_org on public.mk_accounts (organisation_id, name);

-- Daily figures. source: ads (dim = campaign id, '' = account total), ga4 (dim = channel group, '' = total),
-- gsc (dim '' = site total)
create table if not exists public.mk_daily (
  account_id       uuid not null references public.mk_accounts(id) on delete cascade,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  source           text not null check (source in ('ads', 'ga4', 'gsc')),
  day              date not null,
  dim              text not null default '',
  dim_name         text,
  impressions      bigint not null default 0,
  clicks           bigint not null default 0,
  cost             numeric(14,2) not null default 0,
  conversions      numeric(14,2) not null default 0,
  conv_value       numeric(14,2) not null default 0,
  sessions         bigint not null default 0,
  users            bigint not null default 0,
  position         numeric(8,2),
  primary key (account_id, source, day, dim)
);
create index if not exists mk_daily_org on public.mk_daily (organisation_id, account_id, day);

-- Each AI review
create table if not exists public.mk_runs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.mk_accounts(id) on delete cascade,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running' check (status in ('running', 'done', 'error')),
  summary          text,
  error            text,
  changes          int not null default 0,
  requested_by     uuid                         -- null = the daily schedule
);
create index if not exists mk_runs_account on public.mk_runs (account_id, started_at desc);

-- Every change the AI made or suggested, and why. before/after hold what's needed to undo it.
create table if not exists public.mk_changes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.mk_accounts(id) on delete cascade,
  run_id           uuid references public.mk_runs(id) on delete set null,
  kind             text not null,              -- pause_keyword | add_negative | set_keyword_bid | set_budget | pause_ad_group
  target           text not null,              -- Google Ads resource name
  label            text not null,              -- what a person reads: "Keyword 'coffee cart' in Weddings"
  before           jsonb not null default '{}'::jsonb,
  after            jsonb not null default '{}'::jsonb,
  reason           text not null,
  status           text not null default 'proposed' check (status in ('proposed', 'applied', 'failed', 'undone', 'rejected', 'blocked')),
  error            text,
  by_ai            boolean not null default true,
  decided_by       uuid,
  applied_at       timestamptz,
  undone_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists mk_changes_account on public.mk_changes (account_id, created_at desc);

-- Monthly client reports (shared with the client by a private link)
create table if not exists public.mk_reports (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.mk_accounts(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  data             jsonb not null default '{}'::jsonb,
  commentary       text,
  status           text not null default 'draft' check (status in ('draft', 'sent')),
  token            text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  sent_at          timestamptz,
  sent_to          text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (account_id, period_start)
);

-- Managers of the business only (the figures are clients' money)
do $$
declare t text;
begin
  foreach t in array array['mk_accounts', 'mk_daily', 'mk_runs', 'mk_changes', 'mk_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_manager(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_manager(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;

-- Daily at 6:10am Canberra (19:10 UTC in summer, 20:10 in winter — run at both, the app skips an account already done today):
-- sync every active account, run the AI review, and on the 1st draft last month's reports.
create or replace function public.mk_kick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sync_trigger_secret';
  if v_secret is null then return null; end if;
  return net.http_post(
    url := 'https://www.eventureos.com.au/api/cron/marketing',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000);
end $$;
revoke all on function public.mk_kick() from public, anon, authenticated;
grant execute on function public.mk_kick() to service_role;

do $$ begin
  perform cron.unschedule('marketing-daily') where exists (select 1 from cron.job where jobname = 'marketing-daily');
  perform cron.schedule('marketing-daily', '10 19,20 * * *', 'select public.mk_kick()');
end $$;
