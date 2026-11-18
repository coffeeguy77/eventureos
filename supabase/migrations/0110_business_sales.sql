-- Business Sales: everything an owner needs to sell a business or one division of it.
-- Stage 1 = sales from Square, staff crew, supplier expenses from Xero (or typed in) and a monthly P&L.
-- Run in Supabase → SQL editor. Safe to run more than once.

-- What's for sale: the whole business or a division of it (e.g. "Tulip Tops café", "Coffee carts", "Roastery").
create table if not exists public.sale_units (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null,
  kind             text not null default 'business' check (kind in ('business', 'division')),
  parent_id        uuid references public.sale_units(id) on delete set null,
  -- which Square locations are this unit's sales ('{}' = none chosen yet)
  square_location_ids text[] not null default '{}',
  -- Square categories to leave out (e.g. coffee beans sold by the roastery); empty = count everything
  exclude_categories  text[] not null default '{}',
  super_pct        numeric(5,2) not null default 12,
  months           int not null default 12 check (months between 1 and 36),
  notes            text,
  position         int not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sale_units_org on public.sale_units (organisation_id, position);

-- Square sales by location and local calendar day. category '' = the whole day's orders;
-- other rows split the day by Square category (line items).
create table if not exists public.sale_square_daily (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  location_id      text not null,
  day              date not null,
  category         text not null default '',
  sales            numeric(14,2) not null default 0,   -- ex GST, after discounts, no tips
  gst              numeric(14,2) not null default 0,
  orders           int not null default 0,
  items            numeric(14,2) not null default 0,
  primary key (organisation_id, location_id, day, category)
);

-- Best sellers: item totals per location per month
create table if not exists public.sale_square_items (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  location_id      text not null,
  month            date not null,
  item             text not null,
  category         text not null default '',
  qty              numeric(14,2) not null default 0,
  sales            numeric(14,2) not null default 0,
  primary key (organisation_id, location_id, month, item)
);

-- Square locations as last seen (names for the screens)
create table if not exists public.sale_square_locations (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  location_id      text not null,
  name             text not null,
  timezone         text,
  status           text,
  synced_from      date,
  synced_to        date,
  synced_at        timestamptz,
  primary key (organisation_id, location_id)
);

-- The standard crew: who it takes to run the unit (typed in, not from payroll)
create table if not exists public.sale_staff (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  unit_id          uuid not null references public.sale_units(id) on delete cascade,
  role             text not null,
  headcount        numeric(6,2) not null default 1,
  pay_type         text not null default 'hourly' check (pay_type in ('annual', 'hourly')),
  annual           numeric(12,2),           -- per person, per year (pay_type annual)
  hourly           numeric(8,2),            -- per hour (pay_type hourly)
  hours_per_shift  numeric(5,2),
  shifts_per_week  numeric(5,2),
  weeks_per_year   numeric(5,2) not null default 52,
  super_pct        numeric(5,2),            -- null = the unit's rate
  notes            text,
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists sale_staff_unit on public.sale_staff (unit_id, position);

-- Expenses: a Xero supplier (its actual spend, or a share of it) or an amount typed in
create table if not exists public.sale_expenses (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  unit_id          uuid not null references public.sale_units(id) on delete cascade,
  kind             text not null default 'overhead' check (kind in ('cogs', 'overhead')),
  source           text not null default 'manual' check (source in ('xero', 'manual')),
  xero_contact_id  text,
  name             text not null,
  share_pct        numeric(6,2) not null default 100,
  annual           numeric(12,2),           -- manual: per year, ex GST
  notes            text,
  position         int not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists sale_expenses_unit on public.sale_expenses (unit_id, position);

-- What each Xero supplier was paid per month (ex GST): spend money + bills, refreshed from Xero
create table if not exists public.sale_xero_spend (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  contact_id       text not null,
  contact_name     text not null,
  month            date not null,
  amount           numeric(14,2) not null default 0,
  primary key (organisation_id, contact_id, month)
);

do $$
declare t text;
begin
  foreach t in array array['sale_units', 'sale_square_daily', 'sale_square_items', 'sale_square_locations', 'sale_staff', 'sale_expenses', 'sale_xero_spend'] loop
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

-- One unit's Square numbers for a period, already rolled up (keeps page loads small):
--  · category '' rows: each location's daily sales, less any excluded categories
--  · other rows: each location's monthly sales per category (excluded categories left out), dated the 1st
create or replace function public.sale_unit_data(p_org uuid, p_locs text[], p_from date, p_to date, p_exclude text[] default '{}')
returns table (location_id text, day date, category text, sales numeric, orders int)
language sql stable security invoker set search_path = public as $$
  select d.location_id, d.day, ''::text,
         sum(case when d.category = '' then d.sales else -d.sales end),
         max(case when d.category = '' then d.orders else 0 end)
  from public.sale_square_daily d
  where d.organisation_id = p_org and d.location_id = any(p_locs) and d.day between p_from and p_to
    and (d.category = '' or lower(d.category) = any(array(select lower(x) from unnest(p_exclude) x)))
  group by d.location_id, d.day
  union all
  select d.location_id, date_trunc('month', d.day)::date, d.category, sum(d.sales), sum(d.orders)::int
  from public.sale_square_daily d
  where d.organisation_id = p_org and d.location_id = any(p_locs) and d.day between p_from and p_to
    and d.category <> '' and not (lower(d.category) = any(array(select lower(x) from unnest(p_exclude) x)))
  group by d.location_id, date_trunc('month', d.day), d.category
$$;

-- Best sellers for a unit and period (excluded categories left out)
create or replace function public.sale_unit_items(p_org uuid, p_locs text[], p_from date, p_to date, p_exclude text[] default '{}', p_limit int default 30)
returns table (item text, category text, qty numeric, sales numeric)
language sql stable security invoker set search_path = public as $$
  select i.item, max(i.category), sum(i.qty), sum(i.sales)
  from public.sale_square_items i
  where i.organisation_id = p_org and i.location_id = any(p_locs) and i.month between date_trunc('month', p_from)::date and p_to
    and not (lower(i.category) = any(array(select lower(x) from unnest(p_exclude) x)))
  group by i.item
  order by sum(i.sales) desc
  limit greatest(1, least(p_limit, 200))
$$;

-- The Square categories a unit's locations sell (for the "leave out" picker)
create or replace function public.sale_unit_categories(p_org uuid, p_locs text[])
returns table (category text, sales numeric)
language sql stable security invoker set search_path = public as $$
  select d.category, sum(d.sales) from public.sale_square_daily d
  where d.organisation_id = p_org and d.location_id = any(p_locs) and d.category <> ''
  group by d.category order by sum(d.sales) desc
$$;

grant execute on function public.sale_unit_data(uuid, text[], date, date, text[]) to authenticated;
grant execute on function public.sale_unit_items(uuid, text[], date, date, text[], int) to authenticated;
grant execute on function public.sale_unit_categories(uuid, text[]) to authenticated;

-- Each unit's sales total for a period (whole orders less its excluded categories), for the list page
create or replace function public.sale_unit_totals(p_org uuid, p_from date, p_to date)
returns table (unit_id uuid, sales numeric)
language sql stable security invoker set search_path = public as $$
  select u.id,
         coalesce(sum(case when d.category = '' then d.sales else -d.sales end), 0)
  from public.sale_units u
  left join public.sale_square_daily d
    on d.organisation_id = u.organisation_id and d.location_id = any(u.square_location_ids)
   and d.day between p_from and p_to
   and (d.category = '' or lower(d.category) = any(array(select lower(x) from unnest(u.exclude_categories) x)))
  where u.organisation_id = p_org
  group by u.id
$$;
grant execute on function public.sale_unit_totals(uuid, date, date) to authenticated;
