-- 0096: Roastery — green coffee stock, roast log and yield (weight loss) per coffee.
-- Stock is a ledger: every receipt, roast and stock-take adjustment is a row in roastery_stock_moves (green kg,
-- + in / − out). On hand = sum of moves. Value = on hand × weighted average cost of what was received.
-- Roasts record green in and roasted out; loss % = (green − roasted) / green. Roasts can come from the
-- W45A roast recorder (recorder_name is that file's name, so importing twice never doubles up).

create table if not exists public.roastery_coffees (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null,
  origin           text,
  supplier         text,
  process          text,
  batch_kg         numeric(8,2) not null default 30 check (batch_kg > 0),
  reorder_kg       numeric(10,2),
  notes            text,
  archived         boolean not null default false,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

create table if not exists public.roastery_roasts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  coffee_id        uuid,
  roasted_at       timestamptz not null default now(),
  green_kg         numeric(8,3) not null check (green_kg > 0),
  roasted_kg       numeric(8,3) check (roasted_kg is null or (roasted_kg > 0 and roasted_kg <= green_kg)),
  loss_pct         numeric(6,2) generated always as (case when roasted_kg is null then null else round((green_kg - roasted_kg) / green_kg * 100, 2) end) stored,
  profile          text,
  charge_c         numeric(6,1),
  turning_point_s  integer,
  first_crack_s    integer,
  first_crack_c    numeric(6,1),
  end_s            integer,
  drop_c           numeric(6,1),
  dtr_pct          numeric(5,1),
  score            numeric(5,2),
  notes            text,
  source           text not null default 'manual' check (source in ('manual','recorder','weighed_list')),
  recorder_name    text,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (organisation_id, recorder_name),
  foreign key (coffee_id, organisation_id) references public.roastery_coffees(id, organisation_id) on delete cascade
);
create index if not exists roastery_roasts_org on public.roastery_roasts (organisation_id, roasted_at desc);
create index if not exists roastery_roasts_coffee on public.roastery_roasts (coffee_id, roasted_at desc);

create table if not exists public.roastery_stock_moves (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  coffee_id        uuid not null,
  happened_at      timestamptz not null default now(),
  kind             text not null check (kind in ('received','roasted','adjusted')),
  kg               numeric(10,3) not null check (kg <> 0),            -- green kg: + in, − out
  cost_per_kg      numeric(10,2) check (cost_per_kg is null or cost_per_kg >= 0),   -- ex GST, for receipts
  roast_id         uuid references public.roastery_roasts(id) on delete cascade,
  note             text,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (coffee_id, organisation_id) references public.roastery_coffees(id, organisation_id) on delete cascade,
  check ((kind = 'received' and kg > 0) or (kind = 'roasted' and kg < 0) or kind = 'adjusted')
);
create index if not exists roastery_moves_coffee on public.roastery_stock_moves (coffee_id, happened_at desc);
create index if not exists roastery_moves_org on public.roastery_stock_moves (organisation_id, happened_at desc);

alter table public.roastery_coffees enable row level security;
alter table public.roastery_roasts enable row level security;
alter table public.roastery_stock_moves enable row level security;
drop policy if exists roastery_coffees_staff on public.roastery_coffees;
create policy roastery_coffees_staff on public.roastery_coffees for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists roastery_roasts_staff on public.roastery_roasts;
create policy roastery_roasts_staff on public.roastery_roasts for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists roastery_moves_staff on public.roastery_stock_moves;
create policy roastery_moves_staff on public.roastery_stock_moves for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
