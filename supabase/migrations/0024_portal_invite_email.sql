-- portal_add_person now returns who to email (and marks the invite time; at most one email an hour)
drop function if exists public.portal_add_person(uuid, text, text, text, text, text);
create or replace function public.portal_add_person(p_event_id uuid, p_first text, p_last text, p_email text, p_phone text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev public.events%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_first text := left(trim(coalesce(p_first, '')), 100);
  v_contact uuid;
  v_by text;
  v_send boolean;
begin
  select * into ev from public.events where id = p_event_id;
  if ev.id is null or ev.customer_id not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  if v_first = '' then raise exception 'Enter their first name'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if (select count(*) from public.event_contacts where event_id = ev.id) >= 20 then raise exception 'This booking already has 20 people — contact us to add more'; end if;

  select id into v_contact from public.contacts where customer_id = ev.customer_id and lower(email) = v_email limit 1;
  if v_contact is null then
    insert into public.contacts (organisation_id, customer_id, first_name, last_name, email, phone, is_primary)
    values (ev.organisation_id, ev.customer_id, v_first, nullif(left(trim(coalesce(p_last, '')), 100), ''), v_email,
            nullif(left(trim(coalesce(p_phone, '')), 40), ''), false)
    returning id into v_contact;
  end if;
  insert into public.event_contacts (organisation_id, event_id, contact_id, role)
  values (ev.organisation_id, ev.id, v_contact, nullif(left(trim(coalesce(p_role, '')), 60), ''))
  on conflict (event_id, contact_id) do update set role = coalesce(excluded.role, public.event_contacts.role);

  -- Email them at most once an hour for this booking
  update public.event_contacts set invited_at = now()
  where event_id = ev.id and contact_id = v_contact and (invited_at is null or invited_at < now() - interval '1 hour')
  returning true into v_send;

  update public.calendar_events set sync_status = 'pending' where event_id = ev.id and kind = 'event';

  select trim(k.first_name || ' ' || coalesce(k.last_name, '')) into v_by from public.contacts k where k.portal_user_id = auth.uid() and k.customer_id = ev.customer_id limit 1;
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (ev.organisation_id, 'customer.person_added', coalesce(v_by, 'The client') || ' added ' || v_first || ' to ' || ev.name,
          v_email || coalesce(' · ' || nullif(trim(coalesce(p_role, '')), ''), ''), '/events/' || ev.id, 'event', ev.id);
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
  values (ev.organisation_id, auth.uid(), 'customer', v_by, 'portal.person_added', 'event', ev.id, ev.customer_id, ev.id,
          coalesce(v_by, 'The client') || ' added ' || v_first || ' (' || v_email || ') to the booking in the portal');
  return jsonb_build_object('email', v_email, 'first_name', v_first, 'invited_by', v_by, 'send', coalesce(v_send, false));
end $$;
revoke all on function public.portal_add_person(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.portal_add_person(uuid, text, text, text, text, text) to authenticated;
