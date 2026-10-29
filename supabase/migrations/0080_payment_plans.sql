-- 0080 — Payment plans (Accounts): what a customer owes, paid off weekly or fortnightly from their card on file
-- (customer_cards, 0079). Each payment is shared across the plan's invoices, oldest first.

create table if not exists public.payment_plans (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null,
  invoice_ids      uuid[] not null,
  total            numeric(12,2) not null,
  frequency        text not null check (frequency in ('weekly','fortnightly')),
  status           text not null default 'active' check (status in ('active','completed','paused','cancelled')),
  note             text,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists payment_plans_customer on public.payment_plans (organisation_id, customer_id);

create table if not exists public.payment_plan_instalments (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  plan_id          uuid not null references public.payment_plans(id) on delete cascade,
  n                integer not null,
  due_date         date not null,
  amount           numeric(12,2) not null check (amount > 0),
  status           text not null default 'scheduled' check (status in ('scheduled','paid','failed','skipped')),
  attempts         integer not null default 0,
  paid_at          timestamptz,
  stripe_payment   text,
  last_error       text,
  unique (plan_id, n)
);
create index if not exists plan_instalments_due on public.payment_plan_instalments (status, due_date) where status in ('scheduled','failed');

alter table public.payment_plans enable row level security;
alter table public.payment_plan_instalments enable row level security;
do $$ declare t text; begin
  foreach t in array array['payment_plans','payment_plan_instalments'] loop
    execute format('drop policy if exists %1$s_manager on public.%1$s', t);
    execute format('create policy %1$s_manager on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;
