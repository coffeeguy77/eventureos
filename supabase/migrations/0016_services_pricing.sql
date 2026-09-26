-- =====================================================================
-- EventureOS 0016 — Services & pricing
--   services         : the organisation's price list (ex-tax unit prices, optional Xero item code)
--   service_packages : bundles with pricing rules (e.g. "Coffee cart", "Coffee van") that
--                      turn "date, times, number of serves" into quote lines
-- Staff read; owners/admins/managers edit.
-- =====================================================================

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code            text,                                   -- e.g. Xero item code "CartHire"
  name            text not null,
  description     text,
  category        text,
  unit            text,                                   -- event, hour, cup, km…
  unit_price      numeric(12,2) not null default 0 check (unit_price >= 0),   -- excluding tax
  tax_rate        numeric(5,2) not null default 10 check (tax_rate >= 0 and tax_rate <= 100),
  xero_account_code text,
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index services_org_code_key on public.services (organisation_id, lower(code)) where code is not null;
create index services_org_idx on public.services (organisation_id, active, position);

create table public.service_packages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null,
  summary         text,                                   -- one line shown when picking, e.g. "A mobile café inside your building"
  rules           jsonb not null default '{}'::jsonb,     -- see lib/pricing/engine.ts (PackageRules)
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index service_packages_org_idx on public.service_packages (organisation_id, active, position);

create trigger services_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger service_packages_updated_at before update on public.service_packages for each row execute function public.set_updated_at();

alter table public.services enable row level security;
alter table public.service_packages enable row level security;

create policy services_select on public.services for select to authenticated using (public.is_org_staff(organisation_id));
create policy services_insert on public.services for insert to authenticated with check (public.is_org_manager(organisation_id));
create policy services_update on public.services for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
create policy services_delete on public.services for delete to authenticated using (public.is_org_manager(organisation_id));

create policy service_packages_select on public.service_packages for select to authenticated using (public.is_org_staff(organisation_id));
create policy service_packages_insert on public.service_packages for insert to authenticated with check (public.is_org_manager(organisation_id));
create policy service_packages_update on public.service_packages for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
create policy service_packages_delete on public.service_packages for delete to authenticated using (public.is_org_manager(organisation_id));
