-- =====================================================================
-- EventureOS 0103 — Late quote acceptance
--   A customer can still accept a quote after its expiry date, as long as the event hasn't happened yet. The job is
--   then marked "availability to be confirmed" (events.availability_tbc): its calendar entry reads "TBC - …", the
--   customer is told to call to confirm availability, and the office confirms it from the job page.
--   Quotes for past events still can't be accepted.
-- Safe to run more than once.
-- =====================================================================

alter table public.events add column if not exists availability_tbc boolean not null default false;

CREATE OR REPLACE FUNCTION public._record_quote_response(p_version_id uuid, p_decision text, p_name text, p_reason text, p_ip text, p_user_agent text, p_actor_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.quote_versions%rowtype;
  q public.quotes%rowtype;
  v_inet inet;
  v_event_date date;
begin
  if p_decision not in ('accepted','declined') then raise exception 'Invalid decision'; end if;
  select * into v from public.quote_versions where id = p_version_id for update;
  select * into q from public.quotes where id = v.quote_id for update;
  if q.current_version_id is distinct from v.id then raise exception 'This quote has been updated — please review the latest version'; end if;
  if v.status not in ('sent','viewed') then raise exception 'This quote has already been %', v.status; end if;
  if q.expiry_date is not null and q.expiry_date < public.org_today(q.organisation_id) then
    -- Past its expiry: still accepted while the event is yet to happen (availability is then confirmed by the office)
    select event_date into v_event_date from public.events where id = q.event_id;
    if p_decision = 'declined' then null;
    elsif v_event_date is null or v_event_date < public.org_today(q.organisation_id) then
      raise exception 'This quote expired on %', to_char(q.expiry_date, 'DD Mon YYYY');
    end if;
  end if;
  if p_decision = 'accepted' and coalesce(trim(p_name), '') = '' then raise exception 'Type your full name to accept'; end if;
  v_inet := public.try_inet(split_part(coalesce(p_ip, ''), ',', 1));

  update public.quote_versions set status = p_decision::public.quote_status, responded_at = now(),
    viewed_at = coalesce(viewed_at, now()),
    accepted_by_name = case when p_decision = 'accepted' then trim(p_name) end,
    acceptance_ip = v_inet, acceptance_user_agent = left(p_user_agent, 400),
    decline_reason = case when p_decision = 'declined' then nullif(trim(p_reason), '') end
  where id = v.id;
  update public.quotes set status = p_decision::public.quote_status where id = q.id;

  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id,
                                    customer_id, event_id, summary, metadata)
  values (q.organisation_id, auth.uid(), p_actor_type, nullif(trim(p_name), ''), 'quote.' || p_decision, 'quote', q.id, q.customer_id, q.event_id,
          case when p_decision = 'accepted' then coalesce(nullif(trim(p_name), ''), 'Customer') || ' accepted quote Q-' || q.number || ' (version ' || v.version_number || ')'
               else 'Customer declined quote Q-' || q.number || coalesce(' — ' || nullif(trim(p_reason), ''), '') end,
          jsonb_build_object('version', v.version_number, 'ip', host(v_inet), 'user_agent', left(p_user_agent, 400), 'recorded_by', p_actor_type));

  if p_decision = 'accepted' then
    perform public.run_quote_accepted(q.id, trim(p_name));
  else
    update public.events set next_action = 'Quote declined — revise or close', next_action_due = now() where id = q.event_id;
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (q.organisation_id, 'quote.declined', 'Quote Q-' || q.number || ' declined', coalesce(nullif(trim(p_reason), ''), 'No reason given'),
            '/events/' || q.event_id || '?tab=quote', 'quote', q.id);
  end if;
end $function$;
