-- 0067 — Hire: equipment you hire out (items, rates, stock), hire bookings and their lines.
-- Any business can switch Hire on (Settings → Modules). Bookings move quote → reservation → booked → out → returned
-- (or cancelled). Reservations, bookings and hires that are out hold stock; quotes only pencil it in.
-- Managed by the office (owners, admins, managers, sales). Items and prices: owners, admins and managers.

create table if not exists public.hire_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  kind text not null default 'hire' check (kind in ('hire', 'sale', 'package')),
  category text,
  subcategory text,
  quantity integer not null default 1 check (quantity >= 0),
  -- broken, being repaired or tagged: not hireable right now
  out_of_service integer not null default 0 check (out_of_service >= 0),
  -- [{unit: "day", price: 90}] — prices include GST; units are set in Hire settings
  rates jsonb not null default '[]'::jsonb,
  bond numeric(12,2) not null default 0,
  -- turnaround (cleaning, loading) before it can go out again; null = the business default
  buffer_hours numeric(6,2),
  -- [{item_id, qty, auto}] — added alongside this item (e.g. 4 weights per marquee)
  companions jsonb not null default '[]'::jsonb,
  -- for kind = 'package': [{item_id, qty}]
  package_lines jsonb not null default '[]'::jsonb,
  image_url text,
  weight_kg numeric(10,2),
  dimensions text,
  location text,
  test_tag_due date,
  service_due date,
  notes text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists hire_items_code on public.hire_items (organisation_id, lower(code)) where code is not null;
create index if not exists hire_items_org on public.hire_items (organisation_id, active, category, name);

create table if not exists public.hire_bookings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  number text,
  status text not null default 'quote' check (status in ('quote', 'reservation', 'booked', 'out', 'returned', 'cancelled')),
  customer_id uuid not null,
  event_id uuid,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fulfilment text not null default 'collect' check (fulfilment in ('collect', 'deliver')),
  address text,
  delivery_at timestamptz,
  pickup_at timestamptz,
  delivery_fee numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  bond numeric(12,2) not null default 0,
  bond_status text not null default 'none' check (bond_status in ('none', 'held', 'returned', 'kept')),
  reference text,
  notes text,
  internal_notes text,
  quote_expires date,
  invoice_id uuid,
  out_at timestamptz,
  returned_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (id, organisation_id),
  unique (organisation_id, number),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (event_id, organisation_id) references public.events(id, organisation_id),
  foreign key (invoice_id) references public.invoices(id) on delete set null
);
create index if not exists hire_bookings_window on public.hire_bookings (organisation_id, status, starts_at, ends_at);
create index if not exists hire_bookings_customer on public.hire_bookings (organisation_id, customer_id);

create table if not exists public.hire_booking_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  booking_id uuid not null references public.hire_bookings(id) on delete cascade,
  item_id uuid references public.hire_items(id) on delete set null,
  name text not null,
  kind text not null default 'hire' check (kind in ('hire', 'sale', 'package', 'misc')),
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  price_note text,
  manual_price boolean not null default false,
  line_total numeric(12,2) not null default 0,
  qty_out integer not null default 0,
  qty_returned integer not null default 0,
  qty_damaged integer not null default 0,
  companion_of uuid references public.hire_booking_lines(id) on delete set null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists hire_booking_lines_booking on public.hire_booking_lines (booking_id, sort);
create index if not exists hire_booking_lines_item on public.hire_booking_lines (organisation_id, item_id);

-- H-1001, H-1002, …
create or replace function public.hire_booking_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then
    new.number := 'H-' || public.next_org_number(new.organisation_id, 'hire', 1001)::text;
  end if;
  return new;
end $$;
drop trigger if exists hire_booking_number on public.hire_bookings;
create trigger hire_booking_number before insert on public.hire_bookings for each row execute function public.hire_booking_number();

alter table public.hire_items enable row level security;
alter table public.hire_bookings enable row level security;
alter table public.hire_booking_lines enable row level security;

drop policy if exists hire_items_select on public.hire_items;
create policy hire_items_select on public.hire_items for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists hire_items_insert on public.hire_items;
create policy hire_items_insert on public.hire_items for insert to authenticated with check (public.is_org_manager(organisation_id));
drop policy if exists hire_items_update on public.hire_items;
create policy hire_items_update on public.hire_items for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists hire_items_delete on public.hire_items;
create policy hire_items_delete on public.hire_items for delete to authenticated using (public.is_org_manager(organisation_id));

drop policy if exists hire_bookings_select on public.hire_bookings;
create policy hire_bookings_select on public.hire_bookings for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists hire_bookings_insert on public.hire_bookings;
create policy hire_bookings_insert on public.hire_bookings for insert to authenticated with check (public.is_org_staff(organisation_id));
drop policy if exists hire_bookings_update on public.hire_bookings;
create policy hire_bookings_update on public.hire_bookings for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists hire_bookings_delete on public.hire_bookings;
create policy hire_bookings_delete on public.hire_bookings for delete to authenticated using (public.is_org_manager(organisation_id));

drop policy if exists hire_booking_lines_select on public.hire_booking_lines;
create policy hire_booking_lines_select on public.hire_booking_lines for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists hire_booking_lines_insert on public.hire_booking_lines;
create policy hire_booking_lines_insert on public.hire_booking_lines for insert to authenticated with check (public.is_org_staff(organisation_id));
drop policy if exists hire_booking_lines_update on public.hire_booking_lines;
create policy hire_booking_lines_update on public.hire_booking_lines for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists hire_booking_lines_delete on public.hire_booking_lines;
create policy hire_booking_lines_delete on public.hire_booking_lines for delete to authenticated using (public.is_org_staff(organisation_id));
