-- =====================================================================
-- EventureOS 0103 — Marketing (Google Analytics 4 client reporting)
--   marketing_connections : one row per client whose GA4 property this business reports on
--     (e.g. Web Culture reports on Navy Uniforms' GA4 property). The property id is not a
--     secret; the read credential is a single service-account key held in Vercel, not here.
-- Additive only. Safe to run more than once.
-- =====================================================================

create table if not exists public.marketing_connections (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  label            text not null check (char_length(label) between 1 and 120),
  provider         text not null default 'ga4' check (provider in ('ga4')),
  ga4_property_id  text not null check (char_length(ga4_property_id) between 1 and 40),
  currency         text not null default 'AUD' check (char_length(currency) <= 8),
  status           text not null default 'active' check (status in ('active', 'archived')),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, ga4_property_id)
);
create index if not exists marketing_connections_org_idx on public.marketing_connections (organisation_id, status, label);
create index if not exists marketing_connections_customer_idx on public.marketing_connections (customer_id);

do $$
begin
  execute 'alter table public.marketing_connections enable row level security';
  execute 'drop policy if exists marketing_connections_select on public.marketing_connections';
  execute 'create policy marketing_connections_select on public.marketing_connections for select to authenticated using (public.is_org_staff(organisation_id))';
  execute 'drop policy if exists marketing_connections_insert on public.marketing_connections';
  execute 'create policy marketing_connections_insert on public.marketing_connections for insert to authenticated with check (public.is_org_manager(organisation_id))';
  execute 'drop policy if exists marketing_connections_update on public.marketing_connections';
  execute 'create policy marketing_connections_update on public.marketing_connections for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))';
  execute 'drop policy if exists marketing_connections_delete on public.marketing_connections';
  execute 'create policy marketing_connections_delete on public.marketing_connections for delete to authenticated using (public.is_org_manager(organisation_id))';
end $$;
