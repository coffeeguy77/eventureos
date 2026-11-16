-- =====================================================================
-- EventureOS 0107 — Loan files: brokers (sign in by emailed link) and signatures
--   loan_brokers         : the brokers you work with (they're not EventureOS users)
--   loan_file_brokers    : which brokers can see which loan files
--   loan_broker_codes    : one-time sign-in links (only a hash is stored)
--   loan_broker_sessions : signed-in browsers (only a hash of the cookie is stored)
--   loan_signatures      : each applicant's drawn signature, name, time, IP and browser
-- Codes, sessions and signatures have no policies for brokers — the server checks the cookie and shows only their files.
-- Safe to run more than once. Needs 0106_loans.sql first.
-- =====================================================================

create table if not exists public.loan_brokers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  email            text not null check (char_length(email) between 3 and 254),
  company          text check (char_length(company) <= 160),
  phone            text check (char_length(phone) <= 40),
  active           boolean not null default true,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists loan_brokers_email_uq on public.loan_brokers (organisation_id, lower(email));

create table if not exists public.loan_file_brokers (
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  broker_id        uuid not null references public.loan_brokers(id) on delete cascade,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  added_at         timestamptz not null default now(),
  primary key (file_id, broker_id)
);
create index if not exists loan_file_brokers_broker_idx on public.loan_file_brokers (broker_id);

create table if not exists public.loan_broker_codes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  broker_id        uuid not null references public.loan_brokers(id) on delete cascade,
  hash             text not null unique,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.loan_broker_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  broker_id        uuid not null references public.loan_brokers(id) on delete cascade,
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.loan_signatures (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  applicant        integer not null check (applicant between 1 and 4),
  signed_name      text not null check (char_length(signed_name) between 2 and 160),
  image            text not null check (char_length(image) <= 400000),   -- data:image/png;base64,…
  signed_at        timestamptz not null default now(),
  ip               text check (char_length(ip) <= 80),
  user_agent       text check (char_length(user_agent) <= 400),
  unique (file_id, applicant)
);

-- the business's own team can see and manage these; brokers never touch tables directly
do $$
declare t text;
begin
  foreach t in array array['loan_brokers', 'loan_file_brokers', 'loan_signatures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_write', t);
  end loop;
end $$;
alter table public.loan_broker_codes enable row level security;     -- server only
alter table public.loan_broker_sessions enable row level security;  -- server only

-- the signed application PDF is a document too
alter table public.loan_documents drop constraint if exists loan_documents_source_check;
alter table public.loan_documents add constraint loan_documents_source_check check (source in ('upload', 'email', 'gmail', 'xero', 'broker', 'signed'));

-- Who looked at what, and when: brokers signing in, opening a file, opening or downloading each document;
-- the client opening their link. Shown on the loan file to the business's team.
create table if not exists public.loan_access_log (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid references public.loan_files(id) on delete cascade,
  actor_kind       text not null check (actor_kind in ('broker', 'client', 'staff')),
  actor_name       text check (char_length(actor_name) <= 160),
  actor_email      text check (char_length(actor_email) <= 254),
  action           text not null check (char_length(action) <= 40),
  detail           text check (char_length(detail) <= 400),
  ip               text check (char_length(ip) <= 80),
  user_agent       text check (char_length(user_agent) <= 400),
  at               timestamptz not null default now()
);
create index if not exists loan_access_log_file_idx on public.loan_access_log (file_id, at desc);
alter table public.loan_access_log enable row level security;
drop policy if exists loan_access_log_select on public.loan_access_log;
create policy loan_access_log_select on public.loan_access_log for select to authenticated using (public.is_org_staff(organisation_id));
-- written by the server only (no insert/update/delete policies), so the log can't be edited from a browser

-- The latest financial-position analysis (figures + the AI's assessment), shown to the team and the file's brokers
alter table public.loan_files add column if not exists analysis jsonb;
