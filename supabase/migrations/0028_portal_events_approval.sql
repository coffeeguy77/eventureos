-- The portal can see whether a booking is waiting for the business to confirm it, and whether accepting will need approval.
create or replace view public.portal_events with (security_barrier = true) as
 select e.id, e.organisation_id, e.number, e.name, e.customer_id, e.event_type, e.event_date, e.start_time, e.finish_time,
    e.venue, e.address, e.guest_count, e.status, e.services, e.customer_notes, e.created_at, e.updated_at,
    case when e.approval_status = 'pending' then 'pending' end as approval_status,
    (select case coalesce(o.settings->>'booking_approval', 'off')
              when 'all' then true
              when 'short_notice' then e.event_date is not null
                and e.event_date - public.org_today(e.organisation_id) <= greatest(0, coalesce((o.settings->>'booking_approval_days')::integer, 2))
              else false end
       from public.organisations o where o.id = e.organisation_id) as approval_on_accept
   from public.events e
  where e.customer_id in (select public.portal_customer_ids());
