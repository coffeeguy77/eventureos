-- =====================================================================
-- EventureOS 0102 — Test & Tag (electrical appliance testing, AS/NZS 3760)
--   tag_assets : every appliance — the business's own (customer_id null) or a customer's — with its retest interval
--   tag_tests  : each test (manual, or imported from a tester such as a Metrel), its readings and result
-- Labels are printed from the browser (Zebra ZPL over Bluetooth), so nothing about printing is stored here.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.tag_assets (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  code             text not null check (char_length(code) between 1 and 40),
  name             text not null check (char_length(name) between 1 and 160),
  category         text check (char_length(category) <= 80),
  make             text check (char_length(make) <= 80),
  model            text check (char_length(model) <= 80),
  serial           text check (char_length(serial) <= 80),
  location         text check (char_length(location) <= 160),
  class            text check (class in ('I', 'II', 'cord', 'rcd', 'other')),
  interval_months  integer not null default 12 check (interval_months between 1 and 120),
  status           text not null default 'active' check (status in ('active', 'retired')),
  last_tested      date,
  last_result      text check (last_result in ('pass', 'fail')),
  next_due         date,
  reminded_for     date,
  notes            text check (char_length(notes) <= 4000),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, code)
);
create index if not exists tag_assets_due_idx on public.tag_assets (organisation_id, status, next_due);
create index if not exists tag_assets_customer_idx on public.tag_assets (customer_id);

create table if not exists public.tag_tests (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  asset_id         uuid not null references public.tag_assets(id) on delete cascade,
  tested_on        date not null,
  result           text not null check (result in ('pass', 'fail')),
  next_due         date,
  tester_name      text check (char_length(tester_name) <= 120),
  tested_by        uuid references public.users(id),
  visual           text check (visual in ('pass', 'fail')),
  earth_ohms       text check (char_length(earth_ohms) <= 40),
  insulation_mohms text check (char_length(insulation_mohms) <= 40),
  leakage_ma       text check (char_length(leakage_ma) <= 40),
  polarity         text check (char_length(polarity) <= 40),
  rcd_ms           text check (char_length(rcd_ms) <= 40),
  notes            text check (char_length(notes) <= 4000),
  source           text not null default 'manual' check (source in ('manual', 'import')),
  device           text check (char_length(device) <= 80),
  raw              jsonb,
  printed_at       timestamptz,
  print_count      integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists tag_tests_asset_idx on public.tag_tests (asset_id, tested_on desc);
create unique index if not exists tag_tests_import_idx on public.tag_tests (asset_id, tested_on, result) where source = 'import';

do $$
declare t text;
begin
  foreach t in array array['tag_assets', 'tag_tests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_staff(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;
