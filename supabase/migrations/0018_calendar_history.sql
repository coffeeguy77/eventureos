-- =====================================================================
-- EventureOS 0018 — Google Calendar history
-- Entries pulled from Google keep their description and guest list, and are linked to the
-- client whose exact email address is a guest (or appears in the description).
-- =====================================================================
alter table public.calendar_events add column if not exists description text;
alter table public.calendar_events add column if not exists attendees text[] not null default '{}';
alter table public.calendar_events add column if not exists html_link text;
alter table public.calendar_events add column if not exists customer_id uuid;
do $$ begin
  alter table public.calendar_events add constraint calendar_events_customer_fk
    foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete set null (customer_id);
exception when duplicate_object then null; end $$;
create index if not exists calendar_events_customer_idx on public.calendar_events (organisation_id, customer_id, starts_at desc) where customer_id is not null;

-- Also link calendar entries (replaces the 0017 version)
create or replace function public.link_customer_emails(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enq integer; v_thr integer; v_cal integer;
begin
  if auth.uid() is not null and not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can link emails'; end if;

  create temporary table if not exists _addr (email text primary key, customer_id uuid) on commit drop;
  truncate _addr;
  -- An address that belongs to more than one customer is ambiguous: skip it.
  insert into _addr (email, customer_id)
  select e, (array_agg(distinct cid))[1] from (
    select lower(trim(c.email)) e, c.id cid from public.customers c where c.organisation_id = p_org and coalesce(trim(c.email), '') <> ''
    union all
    select lower(trim(k.email)), k.customer_id from public.contacts k where k.organisation_id = p_org and coalesce(trim(k.email), '') <> ''
  ) x group by e having count(distinct cid) = 1;

  update public.enquiries q set customer_id = a.customer_id
  from _addr a
  where q.organisation_id = p_org and q.customer_id is null and lower(trim(q.contact_email)) = a.email;
  get diagnostics v_enq = row_count;

  update public.email_threads t set customer_id = s.customer_id
  from (
    select t2.id, (array_agg(distinct a.customer_id))[1] customer_id
    from public.email_threads t2 join _addr a on a.email = any (select lower(p) from unnest(t2.participants) p)
    where t2.organisation_id = p_org and t2.customer_id is null
    group by t2.id having count(distinct a.customer_id) = 1
  ) s
  where t.id = s.id;
  get diagnostics v_thr = row_count;

  -- Calendar entries: a client's exact address is a guest or is written in the description
  update public.calendar_events e set customer_id = s.customer_id
  from (
    select e2.id, (array_agg(distinct a.customer_id))[1] customer_id
    from public.calendar_events e2 join _addr a
      on a.email = any (select lower(x) from unnest(e2.attendees) x)
      or position(a.email in lower(coalesce(e2.description, ''))) > 0
    where e2.organisation_id = p_org and e2.customer_id is null and e2.event_id is null
    group by e2.id having count(distinct a.customer_id) = 1
  ) s
  where e.id = s.id;
  get diagnostics v_cal = row_count;

  -- "Customer since" = their first invoice or quote, when that is earlier than the record
  update public.customers c set customer_since = f.first_date
  from (
    select customer_id, min(d) first_date from (
      select customer_id, issue_date d from public.invoices where organisation_id = p_org and status <> 'void'
      union all
      select customer_id, quote_date from public.xero_quotes where organisation_id = p_org and quote_date is not null
    ) x group by customer_id
  ) f
  where c.organisation_id = p_org and c.id = f.customer_id and f.first_date < c.customer_since;

  return jsonb_build_object('enquiries', v_enq, 'threads', v_thr, 'calendar', v_cal);
end $$;
revoke all on function public.link_customer_emails(uuid) from public, anon;
grant execute on function public.link_customer_emails(uuid) to authenticated, service_role;
