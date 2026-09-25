-- =====================================================================
-- EventureOS — core schema (Phase 1)
-- Multi-tenant: every tenant record carries organisation_id, enforced by
-- Row Level Security AND composite foreign keys (a record can never point
-- at a parent that belongs to a different organisation).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.org_role as enum ('owner','admin','manager','staff','customer');

create type public.enquiry_status as enum (
  'new','needs_review','contacted','qualified','quote_required',
  'quote_sent','negotiating','won','lost','archived');

create type public.enquiry_source as enum (
  'website','email','phone','referral','instagram','facebook','manual','other');

create type public.event_status as enum (
  'enquiry','planning','quoted','awaiting_approval','confirmed','completed','cancelled');

create type public.quote_status as enum (
  'draft','sent','viewed','accepted','declined','expired','superseded');

create type public.invoice_status as enum (
  'draft','awaiting_payment','part_paid','paid','overdue','void');

create type public.email_classification as enum (
  'event_enquiry','existing_event','quote_discussion','general_email',
  'supplier','spam','needs_review');

create type public.task_status as enum ('open','in_progress','done');
create type public.task_priority as enum ('low','normal','high','urgent');

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Platform-level tables
-- ---------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.platform_admins (
  user_id    uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.organisations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  business_type  text,
  logo_url       text,
  brand_colour   text not null default '#6D4AFF',
  contact_email  text,
  contact_phone  text,
  address        text,
  website        text,
  timezone       text not null default 'Australia/Sydney',
  currency       text not null default 'AUD',
  plan           text not null default 'trial',
  status         text not null default 'active' check (status in ('active','suspended','cancelled')),
  settings       jsonb not null default jsonb_build_object(
                    'quote_acceptance_action','deposit_invoice',
                    'deposit_percent',30,
                    'quote_follow_up_days',3,
                    'default_payment_terms_days',14),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.users(id)
);

create table public.organisation_users (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  role            public.org_role not null default 'staff',
  title           text,
  status          text not null default 'active' check (status in ('active','invited','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (organisation_id, user_id)
);
create index on public.organisation_users (user_id);

-- Atomic per-organisation counters (enquiry / event / quote / invoice numbers)
create table public.organisation_counters (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  key             text not null,
  value           integer not null,
  primary key (organisation_id, key)
);

-- ---------------------------------------------------------------------
-- Access helper functions (SECURITY DEFINER so policies never recurse)
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisation_users ou
    where ou.organisation_id = org
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and ou.role = any(roles));
$$;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_role(org, array['owner','admin','manager','staff','customer']::public.org_role[]);
$$;

-- Staff = anyone who works for the business (customers excluded)
create or replace function public.is_org_staff(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_role(org, array['owner','admin','manager','staff']::public.org_role[]);
$$;

create or replace function public.is_org_manager(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_role(org, array['owner','admin','manager']::public.org_role[]);
$$;

create or replace function public.next_org_number(org uuid, counter_key text, start_at integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.organisation_counters (organisation_id, key, value)
  values (org, counter_key, start_at)
  on conflict (organisation_id, key)
  do update set value = public.organisation_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind            text not null default 'individual' check (kind in ('individual','company')),
  name            text not null,
  company         text,
  email           text,
  phone           text,
  address         text,
  notes           text,
  source          public.enquiry_source,
  tags            text[] not null default '{}',
  customer_since  date not null default current_date,
  xero_contact_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (id, organisation_id)
);
create index on public.customers (organisation_id, name);
create index on public.customers (organisation_id, lower(email));

create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  first_name      text not null,
  last_name       text,
  email           text,
  phone           text,
  position        text,
  is_primary      boolean not null default false,
  portal_user_id  uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (id, organisation_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index on public.contacts (organisation_id, lower(email));

-- ---------------------------------------------------------------------
-- Events & enquiries
-- ---------------------------------------------------------------------
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  number             integer,
  name               text not null,
  customer_id        uuid not null,
  primary_contact_id uuid,
  enquiry_id         uuid,
  event_type         text,
  event_date         date,
  start_time         time,
  finish_time        time,
  venue              text,
  address            text,
  guest_count        integer check (guest_count is null or guest_count >= 0),
  budget             numeric(12,2),
  status             public.event_status not null default 'planning',
  assigned_to        uuid references public.users(id) on delete set null,
  assigned_staff     uuid[] not null default '{}',
  internal_notes     text,
  customer_notes     text,
  requirements       text,
  services           text[] not null default '{}',
  equipment          text[] not null default '{}',
  next_action        text,
  next_action_due    timestamptz,
  cancelled_reason   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.users(id),
  unique (id, organisation_id),
  unique (organisation_id, number),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (primary_contact_id, organisation_id) references public.contacts(id, organisation_id)
);
create index on public.events (organisation_id, event_date);
create index on public.events (organisation_id, status);

create table public.enquiries (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations(id) on delete cascade,
  number                    integer,
  customer_id               uuid,
  contact_id                uuid,
  event_id                  uuid,
  title                     text not null,
  event_type                text,
  event_date                date,
  guest_count               integer,
  budget                    numeric(12,2),
  venue                     text,
  message                   text,
  source                    public.enquiry_source not null default 'manual',
  status                    public.enquiry_status not null default 'new',
  classification            public.email_classification,
  classification_confidence numeric(4,3),
  assigned_to               uuid references public.users(id) on delete set null,
  received_at               timestamptz not null default now(),
  last_contact_at           timestamptz,
  next_action               text,
  next_action_due           timestamptz,
  lost_reason               text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.users(id),
  unique (id, organisation_id),
  unique (organisation_id, number),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (contact_id, organisation_id)  references public.contacts(id, organisation_id),
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id)
);
create index on public.enquiries (organisation_id, status);
create index on public.enquiries (organisation_id, received_at desc);

alter table public.events
  add foreign key (enquiry_id, organisation_id) references public.enquiries(id, organisation_id);

create table public.event_contacts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id        uuid not null,
  contact_id      uuid not null,
  role            text,
  created_at      timestamptz not null default now(),
  unique (event_id, contact_id),
  foreign key (event_id, organisation_id)   references public.events(id, organisation_id) on delete cascade,
  foreign key (contact_id, organisation_id) references public.contacts(id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Email (Gmail stays the source of truth; these are synced copies)
-- ---------------------------------------------------------------------
create table public.email_threads (
  id                        uuid primary key default gen_random_uuid(),
  organisation_id           uuid not null references public.organisations(id) on delete cascade,
  integration_id            uuid,
  gmail_thread_id           text,
  subject                   text,
  customer_id               uuid,
  event_id                  uuid,
  enquiry_id                uuid,
  classification            public.email_classification not null default 'needs_review',
  classification_confidence numeric(4,3),
  classified_by             text not null default 'rules' check (classified_by in ('rules','ai','user')),
  state                     text not null default 'open'
                              check (state in ('open','needs_reply','awaiting_customer','closed')),
  participants              text[] not null default '{}',
  message_count             integer not null default 0,
  last_message_at           timestamptz,
  last_inbound_at           timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, gmail_thread_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id),
  foreign key (enquiry_id, organisation_id)  references public.enquiries(id, organisation_id)
);
create index on public.email_threads (organisation_id, last_message_at desc);

create table public.email_messages (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  thread_id        uuid not null,
  gmail_message_id text,
  direction        text not null check (direction in ('inbound','outbound')),
  from_email       text not null,
  from_name        text,
  to_emails        text[] not null default '{}',
  cc_emails        text[] not null default '{}',
  subject          text,
  snippet          text,
  body_text        text,
  body_html        text,
  sent_at          timestamptz not null default now(),
  is_read          boolean not null default false,
  sent_by          uuid references public.users(id),
  created_at       timestamptz not null default now(),
  unique (organisation_id, gmail_message_id),
  foreign key (thread_id, organisation_id) references public.email_threads(id, organisation_id) on delete cascade
);
create index on public.email_messages (thread_id, sent_at);

-- ---------------------------------------------------------------------
-- Quotes: quote_sections / quote_items are the editable DRAFT.
-- Publishing writes an immutable snapshot to quote_versions.
-- ---------------------------------------------------------------------
create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  number             integer,
  event_id           uuid not null,
  customer_id        uuid not null,
  title              text not null,
  status             public.quote_status not null default 'draft',
  issue_date         date not null default current_date,
  expiry_date        date,
  notes              text,
  terms              text,
  current_version_id uuid,
  has_unpublished_changes boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.users(id),
  unique (id, organisation_id),
  unique (organisation_id, number),
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id) on delete cascade,
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);

create table public.quote_sections (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  quote_id        uuid not null,
  title           text not null,
  description     text,
  position        integer not null default 0,
  is_optional     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (quote_id, organisation_id) references public.quotes(id, organisation_id) on delete cascade
);

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  quote_id         uuid not null,
  section_id       uuid,
  name             text not null,
  description      text,
  quantity         numeric(12,2) not null default 1,
  unit             text,
  unit_price       numeric(12,2) not null default 0,
  tax_rate         numeric(5,2)  not null default 10,
  discount_percent numeric(5,2)  not null default 0,
  is_optional      boolean not null default false,
  is_package       boolean not null default false,
  image_url        text,
  position         integer not null default 0,
  line_total       numeric(12,2) generated always as
                     (round(quantity * unit_price * (1 - discount_percent / 100), 2)) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (quote_id, organisation_id)   references public.quotes(id, organisation_id) on delete cascade,
  foreign key (section_id, organisation_id) references public.quote_sections(id, organisation_id) on delete cascade
);

create table public.quote_versions (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  quote_id              uuid not null,
  version_number        integer not null,
  snapshot              jsonb not null,
  subtotal              numeric(12,2) not null,
  tax_total             numeric(12,2) not null,
  total                 numeric(12,2) not null,
  status                public.quote_status not null default 'sent',
  published_at          timestamptz not null default now(),
  published_by          uuid references public.users(id),
  viewed_at             timestamptz,
  responded_at          timestamptz,
  accepted_by_name      text,
  acceptance_ip         inet,
  acceptance_user_agent text,
  decline_reason        text,
  created_at            timestamptz not null default now(),
  unique (quote_id, version_number),
  unique (id, organisation_id),
  foreign key (quote_id, organisation_id) references public.quotes(id, organisation_id) on delete cascade
);

alter table public.quotes
  add foreign key (current_version_id, organisation_id) references public.quote_versions(id, organisation_id);

-- A published version's content can never change; only its response state can.
create or replace function public.guard_quote_version_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.snapshot is distinct from old.snapshot
     or new.version_number is distinct from old.version_number
     or new.total is distinct from old.total
     or new.subtotal is distinct from old.subtotal
     or new.tax_total is distinct from old.tax_total
     or new.quote_id is distinct from old.quote_id
     or new.published_at is distinct from old.published_at then
    raise exception 'Published quote versions are immutable. Create a new version instead.';
  end if;
  return new;
end $$;

create trigger quote_versions_immutable
  before update on public.quote_versions
  for each row execute function public.guard_quote_version_immutable();

-- ---------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------
create table public.calendar_connections (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations(id) on delete cascade,
  integration_id       uuid,
  provider             text not null default 'local' check (provider in ('local','google','microsoft')),
  name                 text not null,
  colour               text not null default '#6D4AFF',
  external_calendar_id text,
  is_default           boolean not null default false,
  sync_enabled         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.users(id),
  unique (id, organisation_id)
);

create table public.calendar_events (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations(id) on delete cascade,
  calendar_connection_id uuid not null,
  event_id               uuid,
  title                  text not null,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  all_day                boolean not null default false,
  location               text,
  kind                   text not null default 'event' check (kind in ('event','site_visit','setup','hold','other')),
  external_event_id      text,
  sync_status            text not null default 'local' check (sync_status in ('local','pending','synced','error')),
  last_synced_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.users(id),
  check (ends_at >= starts_at),
  unique (calendar_connection_id, external_event_id),
  foreign key (calendar_connection_id, organisation_id) references public.calendar_connections(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete cascade
);
create index on public.calendar_events (organisation_id, starts_at);

-- ---------------------------------------------------------------------
-- Tasks & documents
-- ---------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title           text not null,
  description     text,
  status          public.task_status not null default 'open',
  priority        public.task_priority not null default 'normal',
  due_at          timestamptz,
  assigned_to     uuid references public.users(id) on delete set null,
  customer_id     uuid,
  event_id        uuid,
  enquiry_id      uuid,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id) on delete cascade,
  foreign key (enquiry_id, organisation_id)  references public.enquiries(id, organisation_id) on delete cascade
);
create index on public.tasks (organisation_id, status, due_at);

create table public.documents (
  id                      uuid primary key default gen_random_uuid(),
  organisation_id         uuid not null references public.organisations(id) on delete cascade,
  name                    text not null,
  storage_path            text,
  mime_type               text,
  size_bytes              bigint,
  customer_id             uuid,
  event_id                uuid,
  enquiry_id              uuid,
  quote_id                uuid,
  visibility              text not null default 'internal' check (visibility in ('internal','customer')),
  requested_from_customer boolean not null default false,
  uploaded_by             uuid references public.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id) on delete cascade,
  foreign key (enquiry_id, organisation_id)  references public.enquiries(id, organisation_id) on delete cascade,
  foreign key (quote_id, organisation_id)    references public.quotes(id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Invoices & payments (Xero will be authoritative once connected)
-- ---------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  number          text,
  customer_id     uuid not null,
  event_id        uuid,
  quote_id        uuid,
  kind            text not null default 'full' check (kind in ('deposit','final','full','other')),
  issue_date      date not null default current_date,
  due_date        date,
  subtotal        numeric(12,2) not null default 0,
  tax_total       numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  amount_paid     numeric(12,2) not null default 0,
  balance         numeric(12,2) generated always as (total - amount_paid) stored,
  status          public.invoice_status not null default 'draft',
  currency        text not null default 'AUD',
  xero_invoice_id text,
  xero_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (id, organisation_id),
  unique (organisation_id, number),
  unique (organisation_id, xero_invoice_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id),
  foreign key (event_id, organisation_id)    references public.events(id, organisation_id),
  foreign key (quote_id, organisation_id)    references public.quotes(id, organisation_id)
);
create index on public.invoices (organisation_id, status, due_date);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  invoice_id      uuid not null,
  amount          numeric(12,2) not null check (amount > 0),
  paid_at         timestamptz not null default now(),
  method          text,
  reference       text,
  xero_payment_id text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (organisation_id, xero_payment_id),
  foreign key (invoice_id, organisation_id) references public.invoices(id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Integrations (credentials kept in a table no client can read)
-- ---------------------------------------------------------------------
create table public.integrations (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  provider            text not null,
  status              text not null default 'not_connected'
                        check (status in ('not_connected','connected','syncing','error','disconnected')),
  account_label       text,
  external_account_id text,
  scopes              text[] not null default '{}',
  settings            jsonb not null default '{}',
  connected_at        timestamptz,
  connected_by        uuid references public.users(id),
  last_sync_at        timestamptz,
  last_sync_status    text,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, organisation_id),
  unique (organisation_id, provider)
);

create table public.integration_credentials (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  token_type     text,
  raw            jsonb,
  updated_at     timestamptz not null default now()
);

create table public.integration_sync_logs (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  integration_id    uuid not null,
  direction         text not null default 'inbound' check (direction in ('inbound','outbound')),
  entity            text,
  status            text not null check (status in ('running','success','partial','error')),
  records_processed integer not null default 0,
  message           text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  foreign key (integration_id, organisation_id) references public.integrations(id, organisation_id) on delete cascade
);

alter table public.email_threads
  add foreign key (integration_id, organisation_id) references public.integrations(id, organisation_id);
alter table public.calendar_connections
  add foreign key (integration_id, organisation_id) references public.integrations(id, organisation_id);

-- ---------------------------------------------------------------------
-- Notifications, audit log, automation engine
-- ---------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete cascade, -- null = all staff
  type            text not null,
  title           text not null,
  body            text,
  link            text,
  entity_type     text,
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.notifications (organisation_id, created_at desc);

create table public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,
  actor_type      text not null default 'user' check (actor_type in ('user','customer','system','integration')),
  actor_label     text,
  impersonated_by uuid references public.users(id),
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  customer_id     uuid,
  event_id        uuid,
  enquiry_id      uuid,
  summary         text not null,
  changes         jsonb,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index on public.activity_logs (organisation_id, created_at desc);
create index on public.activity_logs (event_id, created_at);
create index on public.activity_logs (enquiry_id, created_at);
create index on public.activity_logs (customer_id, created_at);

create table public.automation_rules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null,
  trigger_type    text not null,   -- e.g. enquiry.created, quote.no_reply, quote.accepted, invoice.paid
  conditions      jsonb not null default '{}',
  actions         jsonb not null default '[]', -- ordered list of {type, params}
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (id, organisation_id)
);

create table public.automation_runs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_id         uuid not null,
  trigger_payload jsonb,
  status          text not null check (status in ('pending','success','error','skipped')),
  result          jsonb,
  created_at      timestamptz not null default now(),
  foreign key (rule_id, organisation_id) references public.automation_rules(id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Numbering & updated_at triggers
-- ---------------------------------------------------------------------
create or replace function public.assign_org_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'invoices' then
    if new.number is null then
      new.number := 'INV-' || public.next_org_number(new.organisation_id, 'invoice', 1001)::text;
    end if;
  elsif new.number is null then
    new.number := public.next_org_number(
      new.organisation_id, TG_TABLE_NAME,
      case TG_TABLE_NAME when 'enquiries' then 1001 when 'events' then 2001 when 'quotes' then 1001 else 1 end);
  end if;
  return new;
end $$;

create trigger enquiries_number before insert on public.enquiries for each row execute function public.assign_org_number();
create trigger events_number    before insert on public.events    for each row execute function public.assign_org_number();
create trigger quotes_number    before insert on public.quotes    for each row execute function public.assign_org_number();
create trigger invoices_number  before insert on public.invoices  for each row execute function public.assign_org_number();

do $$
declare t text;
begin
  foreach t in array array['users','organisations','organisation_users','customers','contacts','events',
    'enquiries','email_threads','quotes','quote_sections','quote_items','calendar_connections',
    'calendar_events','tasks','documents','invoices','integrations','automation_rules']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- Create a public.users row whenever someone signs up
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.users                   enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.organisations           enable row level security;
alter table public.organisation_users      enable row level security;
alter table public.organisation_counters   enable row level security;  -- no policies: internal only
alter table public.integration_credentials enable row level security;  -- no policies: server/service role only

-- users: yourself, or people you share an organisation with
create policy users_select on public.users for select to authenticated using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1 from public.organisation_users mine
    join public.organisation_users theirs on theirs.organisation_id = mine.organisation_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = public.users.id));
create policy users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- organisations: members read; owner/admin update; creation only through create_organisation()
create policy organisations_select on public.organisations for select to authenticated
  using (public.is_org_member(id) or public.is_super_admin());
create policy organisations_update on public.organisations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner','admin']::public.org_role[]));

-- organisation_users: members see their team; owner/admin manage it
create policy org_users_select on public.organisation_users for select to authenticated
  using (user_id = auth.uid() or public.is_org_staff(organisation_id) or public.is_super_admin());
create policy org_users_insert on public.organisation_users for insert to authenticated
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]) and role <> 'owner');
create policy org_users_update on public.organisation_users for update to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
create policy org_users_delete on public.organisation_users for delete to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]) and role <> 'owner');

-- Standard tenant tables: staff read/write, managers delete
do $$
declare t text;
begin
  foreach t in array array['customers','contacts','events','enquiries','event_contacts','email_threads',
    'email_messages','quotes','quote_sections','quote_items','quote_versions','calendar_connections',
    'calendar_events','tasks','documents','invoices','payments','integrations','integration_sync_logs',
    'automation_rules','automation_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_staff(organisation_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;

-- Published quote versions are never deleted
drop policy quote_versions_delete on public.quote_versions;

-- Integrations & automation config: only owner/admin/manager may change
drop policy integrations_insert on public.integrations;
drop policy integrations_update on public.integrations;
create policy integrations_insert on public.integrations for insert to authenticated
  with check (public.is_org_manager(organisation_id));
create policy integrations_update on public.integrations for update to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Notifications: staff see org-wide ones and their own
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (public.is_org_staff(organisation_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_org_staff(organisation_id));
create policy notifications_update on public.notifications for update to authenticated
  using (public.is_org_staff(organisation_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_org_staff(organisation_id));

-- Activity log: append-only, and a user can only log as themselves
alter table public.activity_logs enable row level security;
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_org_staff(organisation_id));
create policy activity_insert on public.activity_logs for insert to authenticated
  with check (public.is_org_staff(organisation_id) and actor_type = 'user' and actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- RPC: create an organisation and make the caller its owner
-- ---------------------------------------------------------------------
create or replace function public.create_organisation(
  org_name text, org_slug text, org_business_type text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_org uuid;
begin
  if uid is null then
    raise exception 'You must be signed in to create an organisation';
  end if;
  if coalesce(trim(org_name), '') = '' then
    raise exception 'Organisation name is required';
  end if;

  insert into public.organisations (name, slug, business_type, created_by)
  values (trim(org_name), lower(org_slug), org_business_type, uid)
  returning id into new_org;

  insert into public.organisation_users (organisation_id, user_id, role, created_by)
  values (new_org, uid, 'owner', uid);

  insert into public.calendar_connections (organisation_id, name, is_default, created_by)
  values (new_org, 'Main Events', true, uid);

  insert into public.integrations (organisation_id, provider)
  values (new_org, 'gmail'), (new_org, 'google_calendar'), (new_org, 'xero');

  insert into public.automation_rules (organisation_id, name, trigger_type, actions, enabled, created_by) values
    (new_org, 'Follow up unanswered quotes', 'quote.no_reply',
      '[{"type":"flag_follow_up"},{"type":"create_task","params":{"title":"Follow up quote"}}]', true, uid),
    (new_org, 'Quote accepted → confirm event', 'quote.accepted',
      '[{"type":"set_event_status","params":{"status":"confirmed"}},{"type":"create_calendar_event"},{"type":"create_invoice","params":{"kind":"deposit"}},{"type":"notify_assigned"}]', true, uid);

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (new_org, uid, 'organisation.created', 'organisation', new_org, 'Organisation created');

  return new_org;
end $$;

revoke all on function public.create_organisation(text, text, text) from public, anon;
grant execute on function public.create_organisation(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Global search (runs as the caller, so RLS still applies)
-- Every word in the query must appear somewhere in the record.
-- ---------------------------------------------------------------------
create or replace function public.global_search(org uuid, q text, max_results integer default 30)
returns table (kind text, id uuid, title text, subtitle text, href text, rank integer)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select w from unnest(string_to_array(lower(trim(q)), ' ')) as w where w <> ''
  ),
  candidates as (
    select 'customer'::text as kind, c.id, c.name as title,
           concat_ws(' · ', c.company, c.email, c.phone) as subtitle,
           '/clients/' || c.id as href, 1 as rank,
           lower(concat_ws(' ', c.name, c.company, c.email, c.phone, c.address)) as hay
    from public.customers c where c.organisation_id = org
    union all
    select 'contact', ct.id, concat_ws(' ', ct.first_name, ct.last_name),
           concat_ws(' · ', ct.email, ct.phone), '/clients/' || ct.customer_id, 2,
           lower(concat_ws(' ', ct.first_name, ct.last_name, ct.email, ct.phone))
    from public.contacts ct where ct.organisation_id = org
    union all
    select 'event', e.id, e.name,
           concat_ws(' · ', to_char(e.event_date, 'DD Mon YYYY'), e.venue), '/events/' || e.id, 1,
           lower(concat_ws(' ', e.name, e.event_type, e.venue, e.address, 'EV-' || e.number, cu.name, cu.company))
    from public.events e join public.customers cu on cu.id = e.customer_id where e.organisation_id = org
    union all
    select 'enquiry', en.id, en.title,
           concat_ws(' · ', 'ENQ-' || en.number, en.status::text), '/enquiries/' || en.id, 2,
           lower(concat_ws(' ', en.title, en.event_type, en.venue, 'ENQ-' || en.number, cu.name, cu.email))
    from public.enquiries en left join public.customers cu on cu.id = en.customer_id where en.organisation_id = org
    union all
    select 'quote', qu.id, 'Quote Q-' || qu.number || ' — ' || qu.title,
           qu.status::text, '/events/' || qu.event_id || '?tab=quote', 3,
           lower(concat_ws(' ', qu.title, 'Q-' || qu.number, qu.number::text, cu.name, ev.name))
    from public.quotes qu
      join public.customers cu on cu.id = qu.customer_id
      join public.events ev on ev.id = qu.event_id
    where qu.organisation_id = org
    union all
    select 'invoice', i.id, i.number || ' — ' || cu.name,
           concat_ws(' · ', i.status::text, '$' || to_char(i.total, 'FM999,999,990.00')),
           coalesce('/events/' || i.event_id || '?tab=invoice', '/clients/' || i.customer_id), 3,
           lower(concat_ws(' ', i.number, cu.name, cu.company, ev.name))
    from public.invoices i
      join public.customers cu on cu.id = i.customer_id
      left join public.events ev on ev.id = i.event_id
    where i.organisation_id = org
    union all
    select 'email', t.id, coalesce(t.subject, '(no subject)'),
           array_to_string(t.participants, ', '),
           coalesce('/events/' || t.event_id || '?tab=communication', '/enquiries/' || t.enquiry_id, '/clients/' || t.customer_id, '/enquiries'), 4,
           lower(concat_ws(' ', t.subject, array_to_string(t.participants, ' ')))
    from public.email_threads t where t.organisation_id = org
  )
  select c.kind, c.id, c.title, c.subtitle, c.href, c.rank
  from candidates c
  where exists (select 1 from words)
    and not exists (select 1 from words w where position(w.w in c.hay) = 0)
  order by c.rank, c.title
  limit max_results;
$$;

grant execute on function public.global_search(uuid, text, integer) to authenticated;
