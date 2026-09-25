-- Portal customers must only ever see customer-safe columns.
-- RLS limits rows, not columns, so portal reads of tables that carry internal
-- fields (events.internal_notes/budget, customers.notes/tags, draft quote text)
-- move to column-restricted views. The views run as their owner and filter to
-- the signed-in customer's own records via portal_customer_ids().

drop policy if exists events_portal_select on public.events;
drop policy if exists customers_portal_select on public.customers;
drop policy if exists quotes_portal_select on public.quotes;

create or replace function public.portal_quote_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select q.id from public.quotes q
  where q.status <> 'draft' and q.customer_id in (select public.portal_customer_ids());
$$;
revoke all on function public.portal_quote_ids() from public, anon;
grant execute on function public.portal_quote_ids() to authenticated;

drop policy if exists quote_versions_portal_select on public.quote_versions;
create policy quote_versions_portal_select on public.quote_versions for select to authenticated
  using (quote_id in (select public.portal_quote_ids()));

create or replace view public.portal_events with (security_barrier = true) as
  select e.id, e.organisation_id, e.number, e.name, e.customer_id, e.event_type, e.event_date, e.start_time, e.finish_time,
         e.venue, e.address, e.guest_count, e.status, e.services, e.customer_notes, e.created_at, e.updated_at
  from public.events e
  where e.customer_id in (select public.portal_customer_ids());

create or replace view public.portal_customers with (security_barrier = true) as
  select c.id, c.organisation_id, c.name, c.company, c.email, c.phone, c.address
  from public.customers c
  where c.id in (select public.portal_customer_ids());

create or replace view public.portal_quotes with (security_barrier = true) as
  select q.id, q.organisation_id, q.number, q.event_id, q.customer_id, q.status, q.current_version_id,
         q.issue_date, q.expiry_date, q.created_at
  from public.quotes q
  where q.status <> 'draft' and q.customer_id in (select public.portal_customer_ids());

revoke all on public.portal_events, public.portal_customers, public.portal_quotes from public, anon;
grant select on public.portal_events, public.portal_customers, public.portal_quotes to authenticated;
