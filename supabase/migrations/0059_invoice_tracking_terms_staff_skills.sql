-- =====================================================================
-- 0059_invoice_tracking_terms_staff_skills.sql
--
-- 1. invoices: when it was emailed / opened (the pay page), and which payment reminders have gone out.
-- 2. customers.payment_terms_days : this client's own payment terms (blank = the business default).
-- 3. crew_members.skills : what each person can do — e.g. {coffee_cart, coffee_van, equipment, catering, driver, roster}.
--    "driver" = can drive the van (licence); "roster" = office / rostering only, never counted as event staff.
-- 4. Automatic invoices (quote accepted) use the client's own payment terms.
-- Adds columns, a function and a trigger; nothing is removed. Safe to run more than once.
-- =====================================================================

alter table public.invoices add column if not exists emailed_at      timestamptz;
alter table public.invoices add column if not exists email_count     integer not null default 0;
alter table public.invoices add column if not exists first_viewed_at timestamptz;
alter table public.invoices add column if not exists last_viewed_at  timestamptz;
alter table public.invoices add column if not exists view_count      integer not null default 0;
-- [{ "key": "pre_7", "kind": "pre_event" | "overdue", "at": "...", "to": ["..."] }]
alter table public.invoices add column if not exists reminders       jsonb   not null default '[]'::jsonb;

-- Invoices already emailed from EventureOS: take the time from the activity log
update public.invoices i set emailed_at = a.first_at, email_count = a.n
from (select entity_id, min(created_at) first_at, count(*)::int n from public.activity_logs where action = 'invoice.emailed' and entity_type = 'invoice' group by entity_id) a
where a.entity_id = i.id and i.emailed_at is null;

alter table public.customers add column if not exists payment_terms_days integer
  check (payment_terms_days is null or payment_terms_days between 0 and 120);

alter table public.crew_members add column if not exists skills text[] not null default '{}';

-- Invoices raised automatically when a quote is accepted: use the client's own payment terms when they have them.
-- (Same "payment before the event" rule as invoice_due_date: an event sooner than the terms makes it due on the day.)
create or replace function public.invoice_client_terms()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_terms integer;
  v_event date;
  s jsonb;
begin
  if new.created_by is not null or new.quote_id is null or new.customer_id is null then return new; end if;
  select c.payment_terms_days into v_terms from public.customers c where c.id = new.customer_id;
  if v_terms is null then return new; end if;
  select settings into s from public.organisations where id = new.organisation_id;
  select e.event_date into v_event from public.events e where e.id = new.event_id;
  new.due_date := new.issue_date + v_terms;
  if coalesce((s->>'pay_before_event')::boolean, false) and v_event is not null and v_event <= new.due_date then
    new.due_date := new.issue_date;
  end if;
  return new;
end $$;
drop trigger if exists invoices_client_terms on public.invoices;
create trigger invoices_client_terms before insert on public.invoices for each row execute function public.invoice_client_terms();
revoke all on function public.invoice_client_terms() from public, anon, authenticated;
