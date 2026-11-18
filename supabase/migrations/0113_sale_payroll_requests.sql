-- Business Sales: real wages from Xero Payroll (per person, per pay run), staff chosen per business/division,
-- and buyers asking for access from the listing page. Run in Supabase → SQL editor. Safe to run more than once.

-- What Xero Payroll paid each person in each posted pay run (from PayRuns → payslip summaries)
create table if not exists public.sale_payroll (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  pay_run_id       text not null,
  employee_id      text not null,
  employee_name    text not null,
  period_start     date,
  period_end       date not null,
  payment_date     date,
  wages            numeric(12,2) not null default 0,
  super            numeric(12,2) not null default 0,
  primary key (organisation_id, pay_run_id, employee_id)
);
create index if not exists sale_payroll_period on public.sale_payroll (organisation_id, period_end);

-- A crew line can be a real person from Xero Payroll (their actual pay for the period, or a share of it)
alter table public.sale_staff add column if not exists source text not null default 'manual';
alter table public.sale_staff add column if not exists xero_employee_id text;
alter table public.sale_staff add column if not exists share_pct numeric(6,2) not null default 100;
do $$ begin
  alter table public.sale_staff drop constraint if exists sale_staff_source_check;
  alter table public.sale_staff add constraint sale_staff_source_check check (source in ('manual', 'xero'));
end $$;

-- Buyers can ask for access from the listing page; the seller approves (which gives them a link) or declines
alter table public.sale_buyers add column if not exists message text;
do $$ begin
  alter table public.sale_buyers drop constraint if exists sale_buyers_status_check;
  alter table public.sale_buyers add constraint sale_buyers_status_check check (status in ('requested', 'invited', 'nda_signed', 'approved', 'revoked'));
end $$;

alter table public.sale_payroll enable row level security;
drop policy if exists sale_payroll_select on public.sale_payroll;
create policy sale_payroll_select on public.sale_payroll for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists sale_payroll_insert on public.sale_payroll;
create policy sale_payroll_insert on public.sale_payroll for insert to authenticated with check (public.is_org_manager(organisation_id));
drop policy if exists sale_payroll_update on public.sale_payroll;
create policy sale_payroll_update on public.sale_payroll for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists sale_payroll_delete on public.sale_payroll;
create policy sale_payroll_delete on public.sale_payroll for delete to authenticated using (public.is_org_manager(organisation_id));
