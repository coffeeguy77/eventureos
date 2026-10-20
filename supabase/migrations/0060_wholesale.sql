-- =====================================================================
-- 0060_wholesale.sql
--
-- Wholesale (café / trade) ordering, kept separate from event clients and the online shop:
--   wholesale_customers     : trade accounts (imported from Ordermentum, or added here); how they pay; their ordering link
--   wholesale_products      : what they can order (ex-GST prices, GST or GST-free)
--   wholesale_group_prices  : special prices for a price group (e.g. "Husk")
--   wholesale_orders        : orders — from Ordermentum (imported, or read from the order emails) or placed here
--   wholesale_order_lines   : what's on each order
-- Self-contained (only organisations) so it can move to RoastMate later.
-- Adds tables and a function; changes nothing that exists. Safe to run more than once.
-- =====================================================================

create table if not exists public.wholesale_customers (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  name                  text not null,                 -- trading name as they're known
  business_name         text,                          -- legal / billing name
  email                 text,
  billing_email         text,
  phone                 text,
  contact_name          text,
  address1              text,
  address2              text,
  suburb                text,
  state                 text,
  postcode              text,
  delivery_instructions text,
  notes                 text,
  abn                   text,
  price_group           text,                          -- matches wholesale_group_prices.price_group
  payment_mode          text not null default 'card' check (payment_mode in ('card', 'invoice')),
  payment_terms_days    integer not null default 7 check (payment_terms_days between 0 and 120),
  delivery_weekday      smallint check (delivery_weekday between 0 and 6),  -- null = the business default
  min_order             numeric(10,2) not null default 0,
  active                boolean not null default true,
  source                text not null default 'eventureos' check (source in ('eventureos', 'ordermentum')),
  external_ref          text,                          -- Ordermentum customer id
  order_token           text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  last_order_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists wholesale_customers_token_idx on public.wholesale_customers (order_token);
create index if not exists wholesale_customers_org_idx on public.wholesale_customers (organisation_id, name);

create table if not exists public.wholesale_products (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sku             text,
  name            text not null,
  description     text,
  category        text,
  unit_price      numeric(10,2) not null default 0,   -- ex GST
  tax_rate        numeric(5,2) not null default 0,    -- 10 = GST, 0 = GST-free
  weight_kg       numeric(8,3),                       -- per unit, for the roast list
  min_qty         integer not null default 1,
  active          boolean not null default true,      -- shown on the ordering page
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists wholesale_products_sku_idx on public.wholesale_products (organisation_id, lower(sku)) where sku is not null;

create table if not exists public.wholesale_group_prices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  product_id      uuid not null references public.wholesale_products(id) on delete cascade,
  price_group     text not null,
  unit_price      numeric(10,2) not null              -- ex GST
);
create unique index if not exists wholesale_group_prices_idx on public.wholesale_group_prices (product_id, price_group);

create table if not exists public.wholesale_orders (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  customer_id           uuid references public.wholesale_customers(id) on delete set null,
  number                text not null,                 -- OMO2706 (Ordermentum) or W-1001
  seq                   integer,                       -- for W- numbers
  invoice_number        text,                          -- OMI2706
  source                text not null check (source in ('eventureos', 'ordermentum')),
  status                text not null default 'placed' check (status in ('pending', 'placed', 'packed', 'delivered', 'cancelled')),
  order_date            date not null,
  delivery_date         date,
  subtotal              numeric(10,2) not null default 0,   -- ex GST
  freight               numeric(10,2) not null default 0,
  gst                   numeric(10,2) not null default 0,
  discount              numeric(10,2) not null default 0,
  total                 numeric(10,2) not null default 0,   -- inc GST
  payment_mode          text check (payment_mode in ('card', 'invoice')),
  payment_status        text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'n/a')),
  paid_at               timestamptz,
  due_date              date,
  stripe_session_id     text,
  stripe_payment_intent text,
  customer_note         text,
  office_note           text,
  needs_check           text,                          -- why an imported order should be looked at
  gmail_message_id      text,
  ship_to               jsonb,                         -- a delivery address different to the customer's
  view_token            text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists wholesale_orders_number_idx on public.wholesale_orders (organisation_id, number);
create index if not exists wholesale_orders_delivery_idx on public.wholesale_orders (organisation_id, delivery_date);
create index if not exists wholesale_orders_customer_idx on public.wholesale_orders (customer_id, order_date desc);

create table if not exists public.wholesale_order_lines (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  order_id        uuid not null references public.wholesale_orders(id) on delete cascade,
  product_id      uuid references public.wholesale_products(id) on delete set null,
  sku             text,
  name            text not null,
  quantity        numeric(10,3) not null,
  unit_price      numeric(10,2) not null,             -- ex GST
  tax_rate        numeric(5,2) not null default 0,
  line_total      numeric(10,2) not null,             -- ex GST
  weight_kg       numeric(8,3),                       -- per unit
  comment         text,
  position        integer not null default 0
);
create index if not exists wholesale_order_lines_order_idx on public.wholesale_order_lines (order_id, position);

-- Staff see and manage; managers delete. Customers never read these directly (their ordering link goes through the server).
do $$
declare t text;
begin
  foreach t in array array['wholesale_customers','wholesale_products','wholesale_group_prices','wholesale_orders','wholesale_order_lines'] loop
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

-- Next W- order number for an organisation (W-1001, W-1002, …)
create or replace function public.wholesale_next_seq(p_org uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('wholesale_seq_' || p_org::text));
  select coalesce(max(seq), 1000) + 1 into n from public.wholesale_orders where organisation_id = p_org;
  return n;
end $$;
revoke all on function public.wholesale_next_seq(uuid) from public, anon, authenticated;
grant execute on function public.wholesale_next_seq(uuid) to service_role;
