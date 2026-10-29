-- 0078 — Accounts: the resolution centre and account-keeping fees.
--  * account_issues: an invoice the accounts person flags for a decision — write it off, investigate, keep chasing.
--  * account_fees: every account-keeping fee charged on an overdue invoice (which months, what rate, the fee invoice),
--    so the same month is never charged twice.

create table if not exists public.account_issues (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null,
  invoice_id       uuid references public.invoices(id) on delete set null,
  reason           text not null,
  amount           numeric(12,2),                 -- what was owing when it was flagged
  status           text not null default 'open' check (status in ('open','investigating','write_off','keep_chasing','resolved')),
  decision_note    text,
  raised_by        uuid references public.users(id) default auth.uid(),
  decided_by       uuid references public.users(id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists account_issues_org on public.account_issues (organisation_id, status, created_at desc);

create table if not exists public.account_fees (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid not null,
  invoice_id       uuid not null references public.invoices(id) on delete cascade,   -- the overdue invoice
  fee_invoice_id   uuid references public.invoices(id) on delete set null,          -- the invoice the fee went on
  months           integer not null check (months > 0),
  percent          numeric(6,3) not null,
  balance          numeric(12,2) not null,
  amount           numeric(12,2) not null,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade
);
create index if not exists account_fees_invoice on public.account_fees (organisation_id, invoice_id);

alter table public.account_issues enable row level security;
alter table public.account_fees enable row level security;
do $$ declare t text; begin
  foreach t in array array['account_issues','account_fees'] loop
    execute format('drop policy if exists %1$s_manager on public.%1$s', t);
    execute format('create policy %1$s_manager on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;
