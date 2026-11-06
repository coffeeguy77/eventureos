-- =====================================================================
-- EventureOS 0101 — Cart Club: a booking page for special business clients
--   cart_club_accounts : a client business on Cart Club (its address e.g. /hotelrealm, its own rates, how it's billed)
--   cart_club_people   : the people at that business who can sign in and book
--   cart_club_codes    : one-time sign-in codes (SMS / email) and welcome links — only hashes are stored
--   cart_club_sessions : signed-in people (the browser keeps a random token; only its hash is stored)
--   cart_club_bookings : quotes and bookings made on Cart Club (editable until booked, then locked)
--   cart_club_runs     : delivery / pickup runs worked out from the bookings (with their calendar entries)
-- Club people never get a database login: the server checks these tables. Office staff can read; managers change.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.cart_club_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  customer_id           uuid not null references public.customers(id) on delete cascade,
  slug                  text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name                  text not null check (char_length(name) between 1 and 160),
  enabled               boolean not null default true,
  offers                text[] not null default array['cart']::text[],
  rates                 jsonb not null default '{}'::jsonb check (jsonb_typeof(rates) = 'object'),
  billing               text not null default 'on_booking' check (billing in ('on_booking', 'monthly')),
  due_rule              text not null default 'after_invoice' check (due_rule in ('after_invoice', 'before_event')),
  due_days              integer not null default 7 check (due_days between 0 and 90),
  standard_orders       jsonb not null default '[]'::jsonb check (jsonb_typeof(standard_orders) = 'array'),
  wholesale_customer_id uuid references public.wholesale_customers(id) on delete set null,
  email_invoices        boolean not null default false,
  follow_up             boolean not null default false,
  notes                 text check (char_length(notes) <= 4000),
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, slug),
  unique (organisation_id, customer_id)
);

create table if not exists public.cart_club_people (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.cart_club_accounts(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  name             text not null check (char_length(name) between 1 and 160),
  email            text check (char_length(email) <= 254),
  phone            text check (char_length(phone) <= 40),
  active           boolean not null default true,
  welcomed_at      timestamptz,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create unique index if not exists cart_club_people_email_idx on public.cart_club_people (account_id, lower(email)) where email is not null;
create index if not exists cart_club_people_account_idx on public.cart_club_people (account_id);

create table if not exists public.cart_club_codes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  person_id        uuid not null references public.cart_club_people(id) on delete cascade,
  kind             text not null default 'code' check (kind in ('code', 'link')),
  hash             text not null check (hash ~ '^[0-9a-f]{64}$'),
  channel          text not null default 'email' check (channel in ('email', 'sms')),
  attempts         integer not null default 0,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists cart_club_codes_person_idx on public.cart_club_codes (person_id, created_at desc);
create unique index if not exists cart_club_codes_link_idx on public.cart_club_codes (hash) where kind = 'link';

create table if not exists public.cart_club_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  person_id        uuid not null references public.cart_club_people(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.cart_club_bookings (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.cart_club_accounts(id) on delete cascade,
  number           integer generated always as identity,
  status           text not null default 'quote' check (status in ('quote', 'booked', 'cancelled')),
  title            text not null check (char_length(title) between 1 and 200),
  venue            text check (char_length(venue) <= 300),
  address          text check (char_length(address) <= 400),
  notes            text check (char_length(notes) <= 4000),
  days             jsonb not null default '[]'::jsonb check (jsonb_typeof(days) = 'array'),
  carts            integer not null default 0 check (carts between 0 and 20),
  van              integer not null default 0 check (van between 0 and 5),
  baristas         integer not null default 0 check (baristas between 0 and 20),
  coffees          integer not null default 0 check (coffees between 0 and 100000),
  lines            jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  subtotal         numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  first_day        date,
  last_day         date,
  created_by       uuid references public.cart_club_people(id) on delete set null,
  created_by_name  text check (char_length(created_by_name) <= 160),
  updated_by_name  text check (char_length(updated_by_name) <= 160),
  booked_by        uuid references public.cart_club_people(id) on delete set null,
  booked_by_name   text check (char_length(booked_by_name) <= 160),
  booked_at        timestamptz,
  cancelled_at     timestamptz,
  event_id         uuid references public.events(id) on delete set null,
  invoice_id       uuid references public.invoices(id) on delete set null,
  follow_up_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists cart_club_bookings_account_idx on public.cart_club_bookings (account_id, first_day);
create index if not exists cart_club_bookings_org_idx on public.cart_club_bookings (organisation_id, status, first_day);

create table if not exists public.cart_club_runs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  account_id       uuid not null references public.cart_club_accounts(id) on delete cascade,
  starts           date not null,
  ends             date not null,
  carts            integer not null default 1,
  delivery_entry   uuid references public.calendar_events(id) on delete set null,
  pickup_entry     uuid references public.calendar_events(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists cart_club_runs_account_idx on public.cart_club_runs (account_id, starts);

-- Office staff read; managers change. (The club pages themselves use the server's service role.)
do $$
declare t text;
begin
  foreach t in array array['cart_club_accounts', 'cart_club_people', 'cart_club_bookings', 'cart_club_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_manager(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;
-- Codes and sessions: server only (no policies = no access for logged-in users)
alter table public.cart_club_codes enable row level security;
alter table public.cart_club_sessions enable row level security;
