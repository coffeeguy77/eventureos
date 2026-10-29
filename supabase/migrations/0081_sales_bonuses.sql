-- 0081 — Sales bonuses: a team member earns a % of an invoice (ex GST) — e.g. 10% on new website builds, 5% on
-- maintenance — once the customer pays it. The business chooses which earned bonuses to pay, with the bank
-- description, and the team member sees it all on their "My bonuses" page.

create table if not exists public.sales_bonuses (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  kind             text not null check (kind in ('build','maintenance','other')),
  rate             numeric(5,2) not null check (rate >= 0 and rate <= 100),
  status           text not null default 'open' check (status in ('open','paid','cancelled')),
  amount_paid      numeric(12,2),            -- what was paid out to the team member
  paid_on          date,
  reference        text,                     -- the bank description on the transfer
  note             text,
  created_by       uuid references public.users(id) default auth.uid(),
  paid_by          uuid references public.users(id),
  created_at       timestamptz not null default now(),
  unique (invoice_id, user_id)
);
create index if not exists sales_bonuses_user on public.sales_bonuses (organisation_id, user_id, status);

alter table public.sales_bonuses enable row level security;
-- managers see bonuses and can credit open ones; only owners and admins can mark them paid (or change paid ones)
drop policy if exists sales_bonuses_manager on public.sales_bonuses;
drop policy if exists sales_bonuses_read on public.sales_bonuses;
drop policy if exists sales_bonuses_credit on public.sales_bonuses;
drop policy if exists sales_bonuses_uncredit on public.sales_bonuses;
drop policy if exists sales_bonuses_pay on public.sales_bonuses;
create policy sales_bonuses_read on public.sales_bonuses for select to authenticated using (public.is_org_manager(organisation_id));
create policy sales_bonuses_credit on public.sales_bonuses for insert to authenticated with check (public.is_org_manager(organisation_id) and status = 'open');
create policy sales_bonuses_uncredit on public.sales_bonuses for delete to authenticated using (public.is_org_manager(organisation_id) and status = 'open');
create policy sales_bonuses_pay on public.sales_bonuses for update to authenticated
  using (exists (select 1 from public.organisation_users ou where ou.organisation_id = sales_bonuses.organisation_id and ou.user_id = auth.uid() and ou.role in ('owner','admin')))
  with check (exists (select 1 from public.organisation_users ou where ou.organisation_id = sales_bonuses.organisation_id and ou.user_id = auth.uid() and ou.role in ('owner','admin')));
