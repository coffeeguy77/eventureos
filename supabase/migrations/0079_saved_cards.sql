-- 0079 — Cards on file for invoices (Accounts).
--  * customer_cards: a card a customer agreed to keep on file, saved by Stripe while taking a payment over the phone.
--    Only Stripe's ids and the card's brand, last 4 digits and expiry are stored here — never the card number.
--  * collection_notes.charge_card: a promise to pay that charges the card on file that morning (instead of emailing).

create table if not exists public.customer_cards (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  customer_id        uuid not null,
  stripe_customer    text not null,
  payment_method     text not null,
  brand              text,
  last4              text,
  exp_month          integer,
  exp_year           integer,
  consent            text,                        -- what the customer agreed to, and when
  added_by           uuid references public.users(id),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists customer_cards_customer on public.customer_cards (organisation_id, customer_id) where active;

alter table public.customer_cards enable row level security;
drop policy if exists customer_cards_manager on public.customer_cards;
create policy customer_cards_manager on public.customer_cards for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

alter table public.collection_notes add column if not exists charge_card boolean not null default false;
