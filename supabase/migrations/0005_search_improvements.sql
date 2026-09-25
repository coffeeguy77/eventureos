-- Search also matches customer tags and raw enquiry contact details
create or replace function public.global_search(org uuid, q text, max_results integer default 30)
returns table (kind text, id uuid, title text, subtitle text, href text, rank integer)
language sql stable security invoker set search_path = '' as $$
  with words as (
    select w from unnest(string_to_array(lower(trim(q)), ' ')) as w where w <> ''
  ),
  candidates as (
    select 'customer'::text as kind, c.id, c.name as title,
           concat_ws(' · ', c.company, c.email, c.phone) as subtitle,
           '/clients/' || c.id as href, 1 as rank,
           lower(concat_ws(' ', c.name, c.company, c.email, c.phone, c.address, array_to_string(c.tags, ' '))) as hay
    from public.customers c where c.organisation_id = org
    union all
    select 'contact', ct.id, concat_ws(' ', ct.first_name, ct.last_name),
           concat_ws(' · ', ct.email, ct.phone), '/clients/' || ct.customer_id, 2,
           lower(concat_ws(' ', ct.first_name, ct.last_name, ct.email, ct.phone, cust.name, array_to_string(cust.tags, ' ')))
    from public.contacts ct join public.customers cust on cust.id = ct.customer_id
    where ct.organisation_id = org
      and lower(concat_ws(' ', ct.first_name, ct.last_name)) <> lower(cust.name) -- avoid duplicating individual customers
    union all
    select 'event', e.id, e.name,
           concat_ws(' · ', to_char(e.event_date, 'DD Mon YYYY'), e.venue), '/events/' || e.id, 1,
           lower(concat_ws(' ', e.name, e.event_type, e.venue, e.address, 'EV-' || e.number, cu.name, cu.company))
    from public.events e join public.customers cu on cu.id = e.customer_id where e.organisation_id = org
    union all
    select 'enquiry', en.id, en.title,
           concat_ws(' · ', 'ENQ-' || en.number, en.status::text), '/enquiries/' || en.id, 2,
           lower(concat_ws(' ', en.title, en.event_type, en.venue, 'ENQ-' || en.number, cu.name, cu.email, en.contact_name, en.contact_email, en.contact_phone, en.company))
    from public.enquiries en left join public.customers cu on cu.id = en.customer_id where en.organisation_id = org
    union all
    select 'quote', qu.id, 'Quote Q-' || qu.number || ' — ' || qu.title,
           qu.status::text, '/events/' || qu.event_id || '?tab=quote', 3,
           lower(concat_ws(' ', qu.title, 'Q-' || qu.number, qu.number::text, cu.name, ev.name))
    from public.quotes qu
      join public.customers cu on cu.id = qu.customer_id
      join public.events ev on ev.id = qu.event_id
    where qu.organisation_id = org
    union all
    select 'invoice', i.id, i.number || ' — ' || cu.name,
           concat_ws(' · ', i.status::text, '$' || to_char(i.total, 'FM999,999,990.00')),
           coalesce('/events/' || i.event_id || '?tab=invoice', '/clients/' || i.customer_id), 3,
           lower(concat_ws(' ', i.number, cu.name, cu.company, ev.name))
    from public.invoices i
      join public.customers cu on cu.id = i.customer_id
      left join public.events ev on ev.id = i.event_id
    where i.organisation_id = org
    union all
    select 'email', t.id, coalesce(t.subject, '(no subject)'),
           array_to_string(t.participants, ', '),
           coalesce('/events/' || t.event_id || '?tab=communication', '/enquiries/' || t.enquiry_id, '/clients/' || t.customer_id, '/enquiries'), 4,
           lower(concat_ws(' ', t.subject, array_to_string(t.participants, ' ')))
    from public.email_threads t where t.organisation_id = org
  )
  select c.kind, c.id, c.title, c.subtitle, c.href, c.rank
  from candidates c
  where exists (select 1 from words)
    and not exists (select 1 from words w where position(w.w in c.hay) = 0)
  order by c.rank, c.title
  limit max_results;
$$;

