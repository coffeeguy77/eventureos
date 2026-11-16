-- =====================================================================
-- EventureOS 0106 — Loan files (the "Loan broker" app)
--   loan_files        : one client application — the private link they fill in, their answers (live), status
--   loan_doc_requests : the documents the broker needs (a checklist the broker can change)
--   loan_documents    : files received — uploaded, emailed to the file's address, picked from Gmail, or pulled from Xero
--   loan_messages     : broker <-> client notes on the file ("stuck on this?")
--   loan_connections  : the client's Xero / Gmail, connected with their consent (reports and found emails in `data`)
--   loan_credentials  : their tokens — server only (no policies, so nobody can read them through the API)
-- Storage: private bucket 'loan-docs'. Clients never touch tables directly — their link goes through the server.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.loan_files (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 160),
  loan_type        text check (char_length(loan_type) <= 80),
  amount           numeric(14,2),
  status           text not null default 'invited' check (status in ('invited', 'in_progress', 'submitted', 'reviewing', 'lodged', 'approved', 'settled', 'closed')),
  token            text not null unique check (char_length(token) between 20 and 80),
  inbound_address  text unique check (char_length(inbound_address) <= 160),
  contact_name     text check (char_length(contact_name) <= 160),
  contact_email    text check (char_length(contact_email) <= 254),
  contact_phone    text check (char_length(contact_phone) <= 40),
  applicants       integer not null default 1 check (applicants between 1 and 4),
  answers          jsonb not null default '{}'::jsonb,
  -- what the client is doing right now: { step, field, label, at }
  client_focus     jsonb,
  client_seen_at   timestamptz,
  consent_name     text check (char_length(consent_name) <= 160),
  consent_at       timestamptz,
  submitted_at     timestamptz,
  notes            text check (char_length(notes) <= 8000),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists loan_files_org_idx on public.loan_files (organisation_id, status, updated_at desc);

create table if not exists public.loan_doc_requests (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  label            text not null check (char_length(label) between 1 and 200),
  hint             text check (char_length(hint) <= 400),
  -- which applicant it's for (1, 2 …); null = the whole application
  applicant        integer check (applicant between 1 and 4),
  -- what kind of document, for finding it in email ("licence", "noa", "payslip" …)
  kind             text check (char_length(kind) <= 40),
  status           text not null default 'needed' check (status in ('needed', 'received', 'accepted', 'not_applicable', 'redo')),
  broker_note      text check (char_length(broker_note) <= 1000),
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists loan_doc_requests_file_idx on public.loan_doc_requests (file_id, position);

create table if not exists public.loan_documents (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  request_id       uuid references public.loan_doc_requests(id) on delete set null,
  name             text not null check (char_length(name) between 1 and 255),
  storage_path     text not null check (char_length(storage_path) <= 500),
  mime             text check (char_length(mime) <= 120),
  size_bytes       bigint,
  source           text not null default 'upload' check (source in ('upload', 'email', 'gmail', 'xero', 'broker')),
  source_detail    text check (char_length(source_detail) <= 400),
  created_at       timestamptz not null default now()
);
create index if not exists loan_documents_file_idx on public.loan_documents (file_id, created_at desc);

create table if not exists public.loan_messages (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  from_side        text not null check (from_side in ('broker', 'client', 'system')),
  author           text check (char_length(author) <= 160),
  body             text not null check (char_length(body) between 1 and 4000),
  -- the question or document it's about (so the client sees it next to that field)
  about            text check (char_length(about) <= 200),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists loan_messages_file_idx on public.loan_messages (file_id, created_at);

create table if not exists public.loan_connections (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  file_id          uuid not null references public.loan_files(id) on delete cascade,
  provider         text not null check (provider in ('xero', 'gmail')),
  account_label    text check (char_length(account_label) <= 254),
  external_id      text check (char_length(external_id) <= 254),
  status           text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  data             jsonb not null default '{}'::jsonb,
  error            text check (char_length(error) <= 1000),
  connected_at     timestamptz not null default now(),
  last_pulled_at   timestamptz,
  unique (file_id, provider, external_id)
);

create table if not exists public.loan_credentials (
  connection_id    uuid primary key references public.loan_connections(id) on delete cascade,
  access_token     text not null,
  refresh_token    text,
  expires_at       timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.loan_credentials enable row level security;  -- no policies: server (service role) only

do $$
declare t text;
begin
  foreach t in array array['loan_files', 'loan_doc_requests', 'loan_documents', 'loan_messages', 'loan_connections'] loop
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

-- Private bucket for the documents (opened only through short-lived signed links made by the server)
insert into storage.buckets (id, name, public, file_size_limit)
values ('loan-docs', 'loan-docs', false, 26214400)
on conflict (id) do nothing;
