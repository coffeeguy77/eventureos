-- 0115 Care Hub — prepaid update blocks, the work timer, files on requests and a client-personalised portal (Nov 2026)
--
-- Run once in the Supabase SQL editor. Safe to run again. Adds only — no existing column, table or data is changed.
--
--  * nh_blocks        one row per prepaid block of hours a client buys. It counts once its invoice is paid.
--  * nh_block_usage   one row per request worked from a block: minutes logged and minutes charged (1-hour minimum,
--                     then up to the next 15 minutes). The balance = paid block hours − charged minutes.
--  * nh_timers        the running work timer, one per staff member.
--  * support_tickets.billing   'block' (from the prepaid block), 'quote' (a one-off job to quote) or null (as before).
--  * support_ticket_updates.files  [{ "path": "...", "name": "...", "size": 123, "type": "image/png" }]
--  * customers.portal_prefs   what the client chose to show on their portal home, and in what order.
--  * storage bucket 'ticket-files' (private; 10 MB a file). Files are read and written by the server only.
--
-- Clients never touch these tables directly: the portal reads and writes them on the server, after checking which
-- client is signed in. Staff of the business use them through the usual organisation rules.

-- 1. Prepaid blocks ------------------------------------------------------------------------------------------------
create table if not exists public.nh_blocks (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  hours           numeric(6,2) not null check (hours > 0 and hours <= 500),
  price_ex_gst    numeric(10,2) not null check (price_ex_gst >= 0),
  label           text,
  invoice_id      uuid references public.invoices(id) on delete set null,
  status          text not null default 'active' check (status in ('active','void')),
  note            text,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists nh_blocks_customer on public.nh_blocks (organisation_id, customer_id);

create table if not exists public.nh_block_usage (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  ticket_id       uuid not null unique,
  minutes_logged  integer not null default 0 check (minutes_logged >= 0),
  minutes_charged integer not null default 0 check (minutes_charged >= 0),
  updated_at      timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (ticket_id, organisation_id) references public.support_tickets(id, organisation_id) on delete cascade
);
create index if not exists nh_block_usage_customer on public.nh_block_usage (organisation_id, customer_id);

-- 2. Work timer (one running timer per person) --------------------------------------------------------------------
create table if not exists public.nh_timers (
  user_id         uuid primary key references public.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  ticket_id       uuid not null,
  started_at      timestamptz not null default now(),
  foreign key (ticket_id, organisation_id) references public.support_tickets(id, organisation_id) on delete cascade
);

-- 3. Requests: how they're paid for, and files ---------------------------------------------------------------------
alter table public.support_tickets add column if not exists billing text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_billing_check') then
    alter table public.support_tickets add constraint support_tickets_billing_check check (billing is null or billing in ('block','quote'));
  end if;
end $$;
alter table public.support_ticket_updates add column if not exists files jsonb not null default '[]'::jsonb;

-- 4. The client's own portal layout -------------------------------------------------------------------------------
alter table public.customers add column if not exists portal_prefs jsonb not null default '{}'::jsonb;

-- 5. Row level security: staff of the organisation only (the portal goes through the server) -----------------------
alter table public.nh_blocks enable row level security;
alter table public.nh_block_usage enable row level security;
alter table public.nh_timers enable row level security;
drop policy if exists nh_blocks_staff on public.nh_blocks;
create policy nh_blocks_staff on public.nh_blocks for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists nh_block_usage_staff on public.nh_block_usage;
create policy nh_block_usage_staff on public.nh_block_usage for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists nh_timers_own on public.nh_timers;
create policy nh_timers_own on public.nh_timers for all to authenticated
  using (user_id = auth.uid() and public.is_org_staff(organisation_id)) with check (user_id = auth.uid() and public.is_org_staff(organisation_id));

-- 6. Files on requests (private bucket; the server signs short-lived links) ----------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-files', 'ticket-files', false, 10485760)
on conflict (id) do nothing;
drop policy if exists "ticket-files: staff read/write own org" on storage.objects;
create policy "ticket-files: staff read/write own org" on storage.objects for all to authenticated
  using (bucket_id = 'ticket-files' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'ticket-files' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));
