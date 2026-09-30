-- Quote links (/q/<token>) accept on the server with the service role, so let the service role raise the approval alert too.
CREATE OR REPLACE FUNCTION public.booking_approval_alert(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ev public.events%rowtype;
  v_to jsonb;
  v_customer text;
begin
  select * into ev from public.events where id = p_event_id for update;
  if ev.id is null or ev.approval_status is distinct from 'pending' or ev.approval_alerted_at is not null
     or ev.approval_requested_at < now() - interval '15 minutes' then
    return null;
  end if;
  if not (public.is_org_member(ev.organisation_id)
          or ev.customer_id in (select public.portal_customer_ids())
          or coalesce(auth.role(), '') = 'service_role') then
    return null;
  end if;
  update public.events set approval_alerted_at = now() where id = ev.id;
  select jsonb_agg(jsonb_build_object('email', u.email, 'name', u.full_name)) into v_to
  from public.organisation_users ou join public.users u on u.id = ou.user_id
  where ou.organisation_id = ev.organisation_id and ou.role in ('owner','admin') and u.email is not null;
  select name into v_customer from public.customers where id = ev.customer_id;
  return jsonb_build_object('to', coalesce(v_to, '[]'::jsonb), 'event_id', ev.id, 'event_name', ev.name, 'event_date', ev.event_date,
    'org_name', (select name from public.organisations where id = ev.organisation_id), 'venue', ev.venue,
    'start_time', ev.start_time, 'customer', v_customer, 'days_away', ev.event_date - public.org_today(ev.organisation_id));
end $function$;
