-- Clients list timed out (984 customers × 5,000+ invoices embedded with payments, no customer_id indexes).
-- Indexes for customer/invoice lookups + one aggregate query for the list. security invoker: RLS still applies,
-- so roles that can't see invoices (sales) just get zero money columns.
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists events_customer_idx on public.events (customer_id);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists quotes_customer_idx on public.quotes (customer_id);
create index if not exists contacts_customer_idx on public.contacts (customer_id);
create index if not exists email_threads_customer_idx on public.email_threads (customer_id);
create index if not exists calendar_events_customer_idx on public.calendar_events (customer_id);
create index if not exists xero_quotes_customer_idx on public.xero_quotes (customer_id);
create index if not exists enquiries_customer_idx on public.enquiries (customer_id);
create index if not exists customers_org_name_idx on public.customers (organisation_id, name);

drop function if exists public.client_list(uuid, text, text, text, int, int);
-- security definer with the RLS rules checked ONCE (per-row policy functions made this take ~2s instead of ~20ms)
create function public.client_list(p_org uuid, p_q text default null, p_kind text default null, p_sort text default 'name', p_limit int default 100, p_offset int default 0)
returns table (id uuid, name text, company text, email text, phone text, kind text, tags text[], customer_since date,
               events int, upcoming int, lifetime numeric, owing numeric, overdue boolean, last_invoice date, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date;
  v_money boolean;
begin
  -- Same rules as RLS: office roles see customers/events; only managers see invoice money.
  if not public.is_org_staff(p_org) then raise exception 'Not allowed'; end if;
  v_money := public.is_org_manager(p_org);
  v_today := public.org_today(p_org);
  return query
  with base as (
    select c.id, c.name, c.company, c.email, c.phone, c.kind::text as kind, c.tags, c.customer_since::date as customer_since
    from public.customers c
    where c.organisation_id = p_org
      and (p_kind is null or c.kind::text = p_kind)
      and (coalesce(trim(p_q), '') = '' or c.name ilike '%' || p_q || '%' or c.company ilike '%' || p_q || '%'
           or c.email ilike '%' || p_q || '%' or c.phone ilike '%' || p_q || '%')
  ),
  ev as (
    select e.customer_id, count(*) n, count(*) filter (where e.event_date >= v_today and e.status <> 'cancelled') up
    from public.events e where e.organisation_id = p_org group by e.customer_id
  ),
  inv as (
    select i.customer_id,
      sum(i.amount_paid) filter (where i.status <> 'void') paid,
      sum(i.balance) filter (where i.status not in ('void','draft')) owing,
      bool_or(i.balance > 0 and (i.status = 'overdue' or (i.status not in ('void','draft') and i.due_date < v_today))) overdue,
      max(i.issue_date) last_inv
    from public.invoices i where i.organisation_id = p_org and v_money group by i.customer_id
  ),
  agg as (
    select b.*, coalesce(ev.n, 0)::int as events, coalesce(ev.up, 0)::int as upcoming,
      coalesce(inv.paid, 0)::numeric as lifetime, coalesce(inv.owing, 0)::numeric as owing, coalesce(inv.overdue, false) as overdue, inv.last_inv as last_invoice
    from base b left join ev on ev.customer_id = b.id left join inv on inv.customer_id = b.id
  )
  select a.id, a.name, a.company, a.email, a.phone, a.kind, a.tags, a.customer_since, a.events, a.upcoming, a.lifetime, a.owing, a.overdue, a.last_invoice,
         count(*) over () as total_count
  from agg a
  order by case when p_sort = 'value' then a.lifetime end desc nulls last,
           case when p_sort = 'owing' then a.owing end desc nulls last,
           case when p_sort = 'recent' then a.last_invoice end desc nulls last,
           a.name
  limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset);
end $$;
revoke all on function public.client_list(uuid, text, text, text, int, int) from public, anon;
grant execute on function public.client_list(uuid, text, text, text, int, int) to authenticated;
