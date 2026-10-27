-- 0075 — Recurring invoices: repeating invoices kept in EventureOS (Web Culture hosting, AdWords, anything monthly),
-- imported from Xero's repeating invoices. EventureOS raises each invoice on its date; with "push to Xero" on
-- they go to Xero like any other invoice. Imported ones start PAUSED, so nothing is billed twice while the Xero
-- repeating invoice still exists — switch each on once you've removed it in Xero.

create table if not exists public.recurring_invoices (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  customer_id        uuid not null,
  name               text not null,
  category           text not null default 'other',          -- hosting | adwords | domains | other (free text)
  status             text not null default 'paused' check (status in ('active','paused','ended')),
  source             text not null default 'manual' check (source in ('manual','xero')),
  xero_repeating_id  text,
  xero_status        text,                                     -- the repeating invoice's status in Xero when imported
  every              integer not null default 1 check (every between 1 and 60),
  unit               text not null default 'month' check (unit in ('week','month')),
  anchor_day         integer,                                  -- day of the month it's raised (monthly)
  next_date          date not null,
  end_date           date,
  due_type           text not null default 'days_after' check (due_type in ('days_after','days_after_month_end','day_of_month','day_of_next_month')),
  due_days           integer not null default 14,
  send_mode          text not null default 'authorise' check (send_mode in ('draft','authorise','email')),
  reference          text,
  line_items         jsonb not null default '[]'::jsonb,       -- invoice lines, GST inclusive (inc: true)
  total              numeric(12,2) not null default 0,
  hosting_account_id uuid references public.hosting_accounts(id) on delete set null,
  last_invoice_id    uuid references public.invoices(id) on delete set null,
  last_raised_at     timestamptz,
  last_error         text,
  notes              text,
  created_by         uuid references public.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);
create unique index if not exists recurring_invoices_xero on public.recurring_invoices (organisation_id, xero_repeating_id) where xero_repeating_id is not null;
create index if not exists recurring_invoices_due on public.recurring_invoices (status, next_date);
create index if not exists recurring_invoices_org on public.recurring_invoices (organisation_id, category);

alter table public.invoices add column if not exists recurring_id uuid references public.recurring_invoices(id) on delete set null;
-- one invoice per repeating invoice per date, even if the run happens twice
create unique index if not exists invoices_recurring_once on public.invoices (recurring_id, issue_date) where recurring_id is not null;

alter table public.recurring_invoices enable row level security;
drop policy if exists recurring_invoices_staff on public.recurring_invoices;
create policy recurring_invoices_staff on public.recurring_invoices for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
