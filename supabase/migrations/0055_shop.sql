-- =====================================================================
-- EventureOS 0055 — Coffee shop with flexible subscriptions (e.g. Bean Culture beans)
--   shop_products / shop_variants : products (coffee, gift cards, other) and their sizes with prices
--   shop_customers                : shoppers (one per email) — saved card for subscriptions lives in the org's Stripe
--   shop_logins / shop_sessions   : shopper sign-in by emailed link (no passwords)
--   shop_addresses                : saved delivery addresses (home, work, …)
--   shop_subscriptions            : a coffee subscription — any frequency, pause, skip, prepaid 3/6/12 months
--   shop_parcels                  : what a subscription sends where — two parcels = a split subscription (home + work)
--   shop_orders                   : one-off orders, subscription deliveries, coffee added to an event, imported WooCommerce orders
--   shop_coupons                  : special-offer codes
--   shop_banners                  : promo banners that link to a product (or a coupon / page)
--   shop_gift_cards               : gift cards for bags of coffee (a dollar balance spent in the shop)
-- Read and written by the server (service role) or the office team; no public table access.
-- WooCommerce imports keep their WooCommerce id (woo_id). Imported subscriptions have billing = 'woocommerce':
-- EventureOS never charges them — WooCommerce keeps billing until the office switches them over.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.shop_products (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  name             text not null check (char_length(name) between 1 and 120),
  kind             text not null default 'coffee' check (kind in ('coffee','gift_card','other')),
  category         text check (char_length(category) <= 60),
  short            text check (char_length(short) <= 400),
  description      text check (char_length(description) <= 8000),
  tasting_notes    text check (char_length(tasting_notes) <= 200),
  origin           text check (char_length(origin) <= 120),
  roast            text check (char_length(roast) <= 40),
  best_for         text check (char_length(best_for) <= 120),
  image_url        text check (image_url is null or image_url ~ '^https://'),
  images           text[] not null default '{}',
  grinds           text[] not null default '{}',      -- grind choices offered (empty = no grind choice)
  subscribable     boolean not null default true,
  featured         boolean not null default false,
  status           text not null default 'active' check (status in ('active','draft','archived')),
  position         integer not null default 0,
  woo_id           bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, slug),
  unique (id, organisation_id)
);
create unique index if not exists shop_products_woo_uq on public.shop_products (organisation_id, woo_id) where woo_id is not null;

create table if not exists public.shop_variants (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  product_id       uuid not null references public.shop_products(id) on delete cascade,
  label            text not null check (char_length(label) between 1 and 60),   -- "1kg", "250g", "$50"
  grams            integer check (grams is null or grams between 1 and 100000),
  price            numeric(10,2) not null check (price >= 0),
  sku              text check (char_length(sku) <= 60),
  active           boolean not null default true,
  position         integer not null default 0,
  woo_ids          bigint[] not null default '{}',     -- WooCommerce variation ids (one per size × grind)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists shop_variants_product_idx on public.shop_variants (product_id);

create table if not exists public.shop_customers (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  email               text not null check (char_length(email) between 3 and 254),
  name                text check (char_length(name) <= 120),
  phone               text check (char_length(phone) <= 40),
  company             text check (char_length(company) <= 120),
  marketing_ok        boolean not null default false,
  student_id          uuid references public.booking_students(id) on delete set null,
  stripe_customer_id  text check (char_length(stripe_customer_id) <= 80),
  stripe_payment_method text check (char_length(stripe_payment_method) <= 80),
  card_label          text check (char_length(card_label) <= 60),        -- "Visa •••• 4242"
  woo_id              bigint,
  notes               text check (char_length(notes) <= 2000),
  source              text not null default 'shop' check (source in ('shop','office','woocommerce','event')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists shop_customers_email_uq on public.shop_customers (organisation_id, lower(email));

create table if not exists public.shop_logins (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.shop_customers(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists shop_logins_customer_idx on public.shop_logins (customer_id, created_at desc);

create table if not exists public.shop_sessions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.shop_customers(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists public.shop_addresses (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null references public.shop_customers(id) on delete cascade,
  label            text not null default 'Home' check (char_length(label) between 1 and 40),
  name             text check (char_length(name) <= 120),
  company          text check (char_length(company) <= 120),
  line1            text not null check (char_length(line1) between 1 and 200),
  line2            text check (char_length(line2) <= 200),
  suburb           text not null check (char_length(suburb) between 1 and 80),
  state            text not null check (char_length(state) between 1 and 20),
  postcode         text not null check (char_length(postcode) between 3 and 10),
  country          text not null default 'AU' check (char_length(country) = 2),
  phone            text check (char_length(phone) <= 40),
  instructions     text check (char_length(instructions) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists shop_addresses_customer_idx on public.shop_addresses (customer_id);

create table if not exists public.shop_coupons (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9_-]{2,40}$'),
  description        text check (char_length(description) <= 200),
  kind               text not null default 'percent' check (kind in ('percent','fixed','free_shipping')),
  value              numeric(10,2) not null default 0 check (value >= 0),
  applies_to         text not null default 'all' check (applies_to in ('all','one_off','subscription')),
  product_ids        uuid[] not null default '{}',     -- empty = every product
  min_spend          numeric(10,2) check (min_spend is null or min_spend >= 0),
  first_order_only   boolean not null default false,
  subscription_cycles integer check (subscription_cycles is null or subscription_cycles between 1 and 120), -- null = every delivery
  max_uses           integer check (max_uses is null or max_uses > 0),
  per_customer       integer check (per_customer is null or per_customer > 0),
  uses               integer not null default 0,
  starts_on          date,
  ends_on            date,
  active             boolean not null default true,
  woo_id             bigint,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organisation_id, code)
);

create table if not exists public.shop_banners (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 120),
  body             text check (char_length(body) <= 300),
  cta_label        text check (char_length(cta_label) <= 40),
  product_id       uuid references public.shop_products(id) on delete set null,
  link_url         text check (link_url is null or link_url ~ '^(https://|/)'),
  coupon_code      text check (char_length(coupon_code) <= 40),
  image_url        text check (image_url is null or image_url ~ '^https://'),
  tone             text not null default 'brand' check (tone in ('brand','dark','light')),
  placement        text not null default 'shop' check (placement in ('shop','top','course','everywhere')),
  starts_on        date,
  ends_on          date,
  active           boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.shop_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  customer_id         uuid not null references public.shop_customers(id) on delete cascade,
  status              text not null default 'pending' check (status in ('pending','active','paused','payment_failed','cancelled')),
  billing             text not null default 'card' check (billing in ('card','prepaid','woocommerce')),
  interval_unit       text not null default 'week' check (interval_unit in ('week','month')),
  interval_count      integer not null default 2 check (interval_count between 1 and 26),
  next_date           date,                     -- next roast + dispatch (and charge, for card billing)
  paused_until        date,                     -- paused: resumes on this date (null = until they resume)
  discount_percent    numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  prepaid_deliveries  integer check (prepaid_deliveries is null or prepaid_deliveries between 1 and 120),
  prepaid_remaining   integer check (prepaid_remaining is null or prepaid_remaining >= 0),
  prepaid_months      integer check (prepaid_months is null or prepaid_months in (3,6,12)),
  renew_prepaid       boolean not null default false,
  coupon_code         text check (char_length(coupon_code) <= 40),
  coupon_cycles_left  integer,
  deliveries_made     integer not null default 0,
  failed_attempts     integer not null default 0,
  last_error          text check (char_length(last_error) <= 300),
  cancelled_at        timestamptz,
  cancel_reason       text check (char_length(cancel_reason) <= 500),
  woo_id              bigint,
  woo_status          text check (char_length(woo_status) <= 30),
  notes               text check (char_length(notes) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organisation_id)
);
create index if not exists shop_subscriptions_due_idx on public.shop_subscriptions (organisation_id, status, next_date);
create unique index if not exists shop_subscriptions_woo_uq on public.shop_subscriptions (organisation_id, woo_id) where woo_id is not null;

-- A parcel = items sent to one address each delivery. Two or more parcels = a split subscription.
create table if not exists public.shop_parcels (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  subscription_id  uuid not null references public.shop_subscriptions(id) on delete cascade,
  label            text not null default 'Home' check (char_length(label) between 1 and 40),
  delivery         text not null default 'post' check (delivery in ('post','pickup')),
  address          jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  items            jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),   -- [{variant_id, grind, qty}]
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists shop_parcels_sub_idx on public.shop_parcels (subscription_id);

create table if not exists public.shop_gift_cards (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  code                  text not null check (code ~ '^[A-Z0-9-]{6,24}$'),
  amount                numeric(10,2) not null check (amount > 0),
  balance               numeric(10,2) not null check (balance >= 0),
  status                text not null default 'pending' check (status in ('pending','active','redeemed','void')),
  purchaser_name        text check (char_length(purchaser_name) <= 120),
  purchaser_email       text check (char_length(purchaser_email) <= 254),
  recipient_name        text check (char_length(recipient_name) <= 120),
  recipient_email       text check (char_length(recipient_email) <= 254),
  message               text check (char_length(message) <= 600),
  send_on               date,
  sent_at               timestamptz,
  expires_on            date,
  order_id              uuid,
  source                text not null default 'shop' check (source in ('shop','office','woocommerce')),
  view_token            text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, code),
  unique (view_token)
);

create table if not exists public.shop_orders (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  number                integer not null,
  customer_id           uuid references public.shop_customers(id) on delete set null,
  subscription_id       uuid references public.shop_subscriptions(id) on delete set null,
  parcel_id             uuid references public.shop_parcels(id) on delete set null,
  event_id              uuid references public.events(id) on delete set null,      -- coffee added to a coffee-cart / event booking
  status                text not null default 'pending' check (status in ('pending','paid','roasting','packed','shipped','completed','cancelled','refunded','failed','on_hold')),
  kind                  text not null default 'one_off' check (kind in ('one_off','subscription_first','subscription_renewal','prepaid','event_addon','gift_card')),
  source                text not null default 'shop' check (source in ('shop','subscription','office','woocommerce','event')),
  email                 text check (char_length(email) <= 254),
  name                  text check (char_length(name) <= 120),
  phone                 text check (char_length(phone) <= 40),
  delivery              text not null default 'post' check (delivery in ('post','pickup','event')),
  address               jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  items                 jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal              numeric(10,2) not null default 0,
  discount              numeric(10,2) not null default 0,
  shipping              numeric(10,2) not null default 0,
  gift_amount           numeric(10,2) not null default 0,
  total                 numeric(10,2) not null default 0,
  currency              text not null default 'AUD',
  coupon_code           text check (char_length(coupon_code) <= 40),
  gift_card_id          uuid references public.shop_gift_cards(id) on delete set null,
  customer_note         text check (char_length(customer_note) <= 1000),
  office_note           text check (char_length(office_note) <= 2000),
  tracking_number       text check (char_length(tracking_number) <= 60),
  dispatch_on           date,
  paid_at               timestamptz,
  shipped_at            timestamptz,
  stripe_session_id     text,
  stripe_payment_intent text,
  view_token            text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  woo_id                bigint,
  woo_status            text check (char_length(woo_status) <= 30),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, number),
  unique (view_token)
);
create index if not exists shop_orders_org_idx on public.shop_orders (organisation_id, created_at desc);
create index if not exists shop_orders_customer_idx on public.shop_orders (customer_id, created_at desc);
create index if not exists shop_orders_status_idx on public.shop_orders (organisation_id, status);
create unique index if not exists shop_orders_woo_uq on public.shop_orders (organisation_id, woo_id) where woo_id is not null;

-- ---------------------------------------------------------------- updated_at + RLS (office team only)
do $$
declare t text;
begin
  foreach t in array array['shop_products','shop_variants','shop_customers','shop_addresses','shop_coupons','shop_banners','shop_subscriptions','shop_parcels','shop_gift_cards','shop_orders'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
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
alter table public.shop_logins enable row level security;
alter table public.shop_sessions enable row level security;

-- ---------------------------------------------------------------- order numbers
-- New orders continue after the highest number used so far (imported WooCommerce numbers included), from 10001.
create or replace function public.shop_next_order_number(p_org uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('shop_order_number:' || p_org::text));
  select greatest(coalesce(max(number), 0), 10000) + 1 into n from public.shop_orders where organisation_id = p_org;
  return n;
end $$;
revoke all on function public.shop_next_order_number(uuid) from public, anon, authenticated;
grant execute on function public.shop_next_order_number(uuid) to service_role;

-- Take up to p_amount off a gift card's balance (locked). Returns what was taken.
create or replace function public.shop_take_gift(p_org uuid, p_code text, p_amount numeric)
returns table (gift_id uuid, taken numeric) language plpgsql security definer set search_path = '' as $$
declare g public.shop_gift_cards%rowtype; v numeric(10,2);
begin
  select * into g from public.shop_gift_cards where organisation_id = p_org and code = upper(trim(p_code)) for update;
  if not found or g.status <> 'active' then raise exception 'That gift card code isn''t valid'; end if;
  if g.expires_on is not null and g.expires_on < (now() at time zone 'Australia/Sydney')::date then raise exception 'That gift card expired on %', to_char(g.expires_on, 'DD/MM/YYYY'); end if;
  if g.balance <= 0 then raise exception 'That gift card has already been used'; end if;
  v := least(g.balance, greatest(p_amount, 0));
  update public.shop_gift_cards set balance = balance - v, status = case when balance - v <= 0 then 'redeemed' else status end where id = g.id;
  return query select g.id, v;
end $$;
revoke all on function public.shop_take_gift(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.shop_take_gift(uuid, text, numeric) to service_role;

-- Give a gift card's balance back (checkout not finished).
create or replace function public.shop_return_gift(p_gift uuid, p_amount numeric)
returns void language sql security definer set search_path = '' as $$
  update public.shop_gift_cards set balance = least(amount, balance + greatest(p_amount, 0)),
    status = case when status = 'redeemed' then 'active' else status end where id = p_gift;
$$;
revoke all on function public.shop_return_gift(uuid, numeric) from public, anon, authenticated;
grant execute on function public.shop_return_gift(uuid, numeric) to service_role;
