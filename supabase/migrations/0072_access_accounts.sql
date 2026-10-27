-- 0072 — Team access and the Accounts app.
--  * Section access: a manager can be limited to chosen parts of the back end (e.g. an accounts person:
--    Accounts, Invoices, Payments, Clients). Empty = everything their role allows.
--  * Accounts (collections): notes, calls, promises to pay and next steps per customer, and every chasing email
--    with whether it was opened, the pay link clicked, and what was paid after it.

alter table public.organisation_users add column if not exists access text[];
alter table public.organisation_invitations add column if not exists access text[];

-- the access chosen on an invitation carries over when it's accepted (with the roster defaults)
create or replace function public.invitation_copy_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.accepted_at is not null and old.accepted_at is null and new.accepted_by is not null then
    update public.organisation_users set auto_add_to_events = new.auto_add_to_events, sees_job_details = new.sees_job_details, access = new.access
    where organisation_id = new.organisation_id and user_id = new.accepted_by;
  end if;
  return new;
end $$;
revoke all on function public.invitation_copy_defaults() from public, anon, authenticated;

create table if not exists public.collection_notes (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null,
  invoice_id       uuid references public.invoices(id) on delete set null,
  kind             text not null default 'note' check (kind in ('note','call','email','sms','promise','dispute','plan')),
  body             text,
  promise_date     date,                 -- they said they'd pay on this day
  promise_amount   numeric(12,2),
  remind           boolean not null default false,   -- email the invoice with a pay link that morning
  reminded_at      timestamptz,
  next_step        text,
  next_step_due    date,
  done_at          timestamptz,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists collection_notes_customer on public.collection_notes (organisation_id, customer_id, created_at desc);
create index if not exists collection_notes_promises on public.collection_notes (organisation_id, promise_date) where remind and reminded_at is null;

create table if not exists public.collection_emails (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null,
  invoice_id       uuid references public.invoices(id) on delete set null,
  kind             text not null default 'manual' check (kind in ('manual','promise','sequence')),
  template         text,
  subject          text,
  to_emails        text[] not null default '{}',
  balance_at_send  numeric(12,2),
  sent_at          timestamptz not null default now(),
  sent_by          uuid references public.users(id),
  opened_at        timestamptz,
  open_count       integer not null default 0,
  clicked_at       timestamptz,
  click_count      integer not null default 0,
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists collection_emails_org on public.collection_emails (organisation_id, sent_at desc);
create index if not exists collection_emails_invoice on public.collection_emails (invoice_id, sent_at desc);

alter table public.collection_notes enable row level security;
alter table public.collection_emails enable row level security;
do $$ declare t text; begin
  foreach t in array array['collection_notes','collection_emails'] loop
    execute format('drop policy if exists %1$s_manager on public.%1$s', t);
    execute format('create policy %1$s_manager on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;
