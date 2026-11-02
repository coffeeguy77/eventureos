-- =====================================================================
-- EventureOS 0092 — Nerd Herd: quote the repair on the ticket, paid before the work starts
--   support_ticket_quotes       : a quote (1) and any variations (2, 3…) on a ticket. Hours, rate and Claude's suggestion
--                                 are internal; the client only ever sees the description, the task names and the price.
--   support_ticket_quote_tasks  : the steps of the work — ticked off by staff; the client sees "done", never the hours
--   support_ticket_contacts     : extra people on the ticket (the quote and updates go to them too)
--   support_ticket_links        : each person's private link to the ticket (so we know who looked)
--   support_ticket_views        : when the ticket / a quote was opened, and by whom
--   support_ticket_updates.gmail_id : the Gmail message we sent, so the inbox sync doesn't log it twice
--   support_tickets.gmail_thread_id : the Gmail conversation the ticket's emails go out on, so replies land on the ticket
-- When the quote's invoice is paid the quote turns green (paid — ready to do).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

create table if not exists public.support_ticket_quotes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  seq              integer not null default 1,
  kind             text not null default 'quote' check (kind in ('quote', 'variation')),
  title            text not null check (char_length(title) between 1 and 200),
  description      text,                                   -- what the client reads
  hours            numeric(8,2) not null default 0,        -- internal
  rate             numeric(10,2) not null default 0,       -- internal: per hour, ex GST
  amount           numeric(12,2) not null default 0,       -- what the client pays, inc GST
  ai_description   text,                                   -- internal: Claude's draft
  ai_hours         numeric(8,2),                           -- internal: Claude's recommended hours
  ai_notes         text,                                   -- internal: Claude's assumptions / risks
  status           text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'paid', 'completed', 'declined', 'cancelled')),
  invoice_id       uuid references public.invoices(id) on delete set null,
  sent_at          timestamptz,
  send_count       integer not null default 0,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       integer not null default 0,
  accepted_at      timestamptz,
  accepted_by      text,
  paid_at          timestamptz,
  completed_at     timestamptz,
  client_notified_at timestamptz,
  declined_at      timestamptz,
  decline_reason   text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (ticket_id, seq)
);
create index if not exists support_ticket_quotes_org on public.support_ticket_quotes (organisation_id, status);
create index if not exists support_ticket_quotes_invoice on public.support_ticket_quotes (invoice_id);

create table if not exists public.support_ticket_quote_tasks (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  quote_id         uuid not null references public.support_ticket_quotes(id) on delete cascade,
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  position         integer not null default 0,
  label            text not null check (char_length(label) between 1 and 300),
  hours            numeric(8,2) not null default 0,        -- internal
  done_at          timestamptz,
  done_by          text,
  created_at       timestamptz not null default now()
);
create index if not exists support_ticket_quote_tasks_quote on public.support_ticket_quote_tasks (quote_id, position);

create table if not exists public.support_ticket_contacts (
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  added_by         uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (ticket_id, contact_id)
);

create table if not exists public.support_ticket_links (
  token            text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  email            text not null,
  name             text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz,
  unique (ticket_id, email)
);

create table if not exists public.support_ticket_views (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  quote_id         uuid references public.support_ticket_quotes(id) on delete cascade,
  link_token       text references public.support_ticket_links(token) on delete set null,
  who              text,
  what             text not null default 'ticket' check (what in ('ticket', 'quote')),
  at               timestamptz not null default now()
);
create index if not exists support_ticket_views_ticket on public.support_ticket_views (ticket_id, at desc);

alter table public.support_ticket_updates add column if not exists gmail_id text;
-- the Gmail conversation we started from the ticket (linked to the inbox thread when the sync sees it)
alter table public.support_tickets add column if not exists gmail_thread_id text;
create unique index if not exists support_ticket_updates_gmail on public.support_ticket_updates (ticket_id, gmail_id) where gmail_id is not null;

-- Paid → the quote is green (ready to do) and the ticket is ready
create or replace function public.nh_quote_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  for q in select sq.id, sq.organisation_id, sq.ticket_id, sq.seq, sq.kind, sq.title, t.number, t.status as ticket_status
           from public.support_ticket_quotes sq join public.support_tickets t on t.id = sq.ticket_id
           where sq.invoice_id = new.id and sq.status in ('sent', 'accepted') loop
    update public.support_ticket_quotes set status = 'paid', paid_at = now(), updated_at = now() where id = q.id;
    update public.support_tickets set status = case when q.ticket_status in ('awaiting_payment', 'new', 'waiting_customer') then 'open' else q.ticket_status end,
      last_activity_at = now(), updated_at = now() where id = q.ticket_id;
    insert into public.support_ticket_updates (organisation_id, ticket_id, kind, body, author_id, author_name)
    values (q.organisation_id, q.ticket_id, 'system', (case when q.kind = 'variation' then 'Variation ' else 'Quote ' end) || q.seq || ' paid (invoice ' || coalesce(new.number, '') || ') — green light, ready to do.', null, 'Nerd Herd');
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (q.organisation_id, 'ticket.paid', left('Paid — ready to do: #' || q.number || ' ' || q.title, 200),
            'Invoice ' || coalesce(new.number, '') || ' has been paid.', '/nerd-herd/tickets/' || q.ticket_id, 'support_ticket', q.ticket_id);
  end loop;
  return new;
end $$;
drop trigger if exists invoices_nh_quote_paid on public.invoices;
create trigger invoices_nh_quote_paid after update of status on public.invoices for each row
  when (new.status = 'paid' and old.status is distinct from 'paid') execute function public.nh_quote_paid();
revoke all on function public.nh_quote_paid() from public, anon, authenticated;

-- Security: the office team only. Clients reach their ticket through the server (private link), which never reads
-- the internal columns (hours, rate, Claude's suggestion).
do $$ declare t text; begin
  foreach t in array array['support_ticket_quotes', 'support_ticket_quote_tasks', 'support_ticket_contacts', 'support_ticket_links', 'support_ticket_views'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_staff on public.%1$s', t);
    execute format('create policy %1$s_staff on public.%1$s for all to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t);
  end loop;
end $$;
