-- Short-notice booking approval + "payment required before the event".
--
-- Organisation settings (organisations.settings jsonb):
--   booking_approval       'off' | 'short_notice' | 'all'   (default 'off')
--   booking_approval_days  integer 0–60                      (default 2) — events within this many days of acceptance
--   pay_before_event       boolean                           (default false) — if the event is on/before the normal
--                          due date, the invoice raised on acceptance is due immediately (today)
--
-- When a quote is accepted and approval applies, the event is NOT confirmed: nothing is added to the calendar and no
-- invoice is raised. The event is flagged approval_status = 'pending' and the office is notified. An owner or admin
-- approves (approve_booking), which runs the normal "Quote accepted" automation.

alter table public.events
  add column if not exists approval_status text check (approval_status in ('pending','approved')),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid references public.users(id) on delete set null,
  add column if not exists approval_alerted_at timestamptz;

create index if not exists events_approval_pending on public.events (organisation_id) where approval_status = 'pending';

-- Due date for an invoice raised today, honouring "payment required before the event".
create or replace function public.invoice_due_date(p_org uuid, p_event_date date)
returns date language plpgsql stable security definer set search_path = '' as $$
declare
  s jsonb;
  v_today date := public.org_today(p_org);
  v_due date;
begin
  select settings into s from public.organisations where id = p_org;
  v_due := v_today + greatest(0, coalesce((s->>'default_payment_terms_days')::integer, 14));
  if coalesce((s->>'pay_before_event')::boolean, false) and p_event_date is not null and p_event_date <= v_due then
    v_due := v_today;
  end if;
  return v_due;
end $$;
revoke all on function public.invoice_due_date(uuid, date) from public, anon;
grant execute on function public.invoice_due_date(uuid, date) to authenticated;

-- The automation part of acceptance: confirm, calendar, invoice, notify. Split out so approval can run it later.
create or replace function public._complete_booking(p_quote_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  ev public.events%rowtype;
  o public.organisations%rowtype;
  v_rule public.automation_rules%rowtype;
  v_action text;
  v_pct numeric;
  v_cal uuid;
  v_inv uuid;
  v_inv_number text;
  v_amount numeric;
  v_due date;
  v_start timestamptz;
  v_end timestamptz;
  v_done jsonb := '[]'::jsonb;
begin
  select * into q from public.quotes where id = p_quote_id;
  select * into v from public.quote_versions where id = q.current_version_id;
  select * into ev from public.events where id = q.event_id;
  select * into o from public.organisations where id = q.organisation_id;

  select * into v_rule from public.automation_rules
  where organisation_id = q.organisation_id and trigger_type = 'quote.accepted' and enabled
  order by created_at limit 1;
  if v_rule.id is null then return; end if;

  if ev.status not in ('confirmed','completed','cancelled') then
    update public.events set status = 'confirmed', next_action = null, next_action_due = null where id = ev.id;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary, changes)
    values (q.organisation_id, 'system', 'Automation', 'event.status_changed', 'event', ev.id, q.customer_id, ev.id, ev.enquiry_id,
            'Event confirmed', jsonb_build_object('status', jsonb_build_array(ev.status, 'confirmed')));
    v_done := v_done || '"confirmed_event"'::jsonb;
  end if;

  if ev.event_date is not null and not exists (select 1 from public.calendar_events where event_id = ev.id and kind = 'event') then
    select id into v_cal from public.calendar_connections where organisation_id = q.organisation_id order by is_default desc, created_at limit 1;
    if v_cal is not null then
      v_start := (ev.event_date + coalesce(ev.start_time, time '09:00')) at time zone o.timezone;
      v_end := (ev.event_date + coalesce(ev.finish_time, ev.start_time, time '17:00')) at time zone o.timezone;
      if v_end < v_start then v_end := v_start; end if;
      insert into public.calendar_events (organisation_id, calendar_connection_id, event_id, title, starts_at, ends_at, location, kind, sync_status)
      values (q.organisation_id, v_cal, ev.id, ev.name, v_start, v_end, ev.venue, 'event', 'pending');
      insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, customer_id, event_id, summary)
      values (q.organisation_id, 'system', 'Automation', 'calendar.created', 'calendar_event', q.customer_id, ev.id, 'Calendar event created');
      v_done := v_done || '"calendar_event"'::jsonb;
    end if;
  end if;

  v_action := coalesce(o.settings->>'quote_acceptance_action', 'deposit_invoice');
  v_pct := coalesce((o.settings->>'deposit_percent')::numeric, 30);
  if v_action in ('deposit_invoice','full_invoice')
     and not exists (select 1 from public.invoices where quote_id = q.id and status <> 'void') then
    v_amount := case when v_action = 'deposit_invoice' then round(v.total * v_pct / 100, 2) else v.total end;
    v_due := public.invoice_due_date(q.organisation_id, ev.event_date);
    insert into public.invoices (organisation_id, customer_id, event_id, quote_id, kind, issue_date, due_date,
                                 subtotal, tax_total, total, status)
    values (q.organisation_id, q.customer_id, ev.id, q.id,
            case when v_action = 'deposit_invoice' then 'deposit' else 'full' end,
            public.org_today(q.organisation_id), v_due,
            round(v_amount / 1.1, 2), v_amount - round(v_amount / 1.1, 2), v_amount, 'awaiting_payment')
    returning id, number into v_inv, v_inv_number;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (q.organisation_id, 'system', 'Automation', 'invoice.created', 'invoice', v_inv, q.customer_id, ev.id,
            case when v_action = 'deposit_invoice' then 'Deposit invoice ' else 'Invoice ' end || v_inv_number || ' generated'
            || case when v_due < public.org_today(q.organisation_id) + greatest(0, coalesce((o.settings->>'default_payment_terms_days')::integer, 14))
               then ' — due now: payment is required before the event' else '' end);
    v_done := v_done || '"invoice"'::jsonb;
  end if;

  if ev.assigned_to is not null then
    insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
    values (q.organisation_id, ev.assigned_to, 'event.confirmed', ev.name || ' is confirmed',
            'Quote accepted — calendar and invoice handled automatically', '/events/' || ev.id, 'event', ev.id);
  end if;

  insert into public.automation_runs (organisation_id, rule_id, trigger_payload, status, result)
  values (q.organisation_id, v_rule.id, jsonb_build_object('quote_id', q.id, 'event_id', ev.id), 'success', jsonb_build_object('actions', v_done));
end $$;
revoke all on function public._complete_booking(uuid) from public, anon, authenticated;

create or replace function public.run_quote_accepted(p_quote_id uuid, p_actor_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  ev public.events%rowtype;
  o public.organisations%rowtype;
  v_mode text;
  v_days integer;
  v_today date;
  v_away integer;
begin
  select * into q from public.quotes where id = p_quote_id;
  select * into v from public.quote_versions where id = q.current_version_id;
  select * into ev from public.events where id = q.event_id;
  select * into o from public.organisations where id = q.organisation_id;
  v_today := public.org_today(q.organisation_id);

  if ev.enquiry_id is not null then
    update public.enquiries set status = 'won' where id = ev.enquiry_id and status not in ('won','archived');
  end if;

  insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
  values (q.organisation_id, null, 'quote.accepted', 'Quote Q-' || q.number || ' accepted',
          coalesce(p_actor_label, 'Customer') || ' accepted ' || to_char(v.total, 'FM$999,999,990.00') || ' — ' || ev.name,
          '/events/' || ev.id || '?tab=quote', 'quote', q.id);

  -- Needs an owner/admin to approve first?
  v_mode := coalesce(o.settings->>'booking_approval', 'off');
  v_days := greatest(0, coalesce((o.settings->>'booking_approval_days')::integer, 2));
  v_away := case when ev.event_date is null then null else ev.event_date - v_today end;
  if ev.approval_status is distinct from 'approved'
     and ev.status not in ('confirmed','completed','cancelled')
     and (v_mode = 'all' or (v_mode = 'short_notice' and v_away is not null and v_away <= v_days)) then
    update public.events set approval_status = 'pending', approval_requested_at = now(),
      approval_decided_at = null, approval_decided_by = null, approval_alerted_at = null,
      next_action = 'Approve or decline this booking', next_action_due = now()
    where id = ev.id;
    insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
    select q.organisation_id, ou.user_id, 'booking.approval',
           'Approve booking: ' || ev.name,
           coalesce(p_actor_label, 'The customer') || ' accepted — event is '
             || case when v_away is null then 'undated' when v_away < 0 then 'in the past'
                     when v_away = 0 then 'TODAY' when v_away = 1 then 'TOMORROW' else 'in ' || v_away || ' days' end
             || '. Not confirmed until you approve.',
           '/events/' || ev.id, 'event', ev.id
    from public.organisation_users ou where ou.organisation_id = q.organisation_id and ou.role in ('owner','admin');
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (q.organisation_id, 'system', 'Automation', 'event.approval_requested', 'event', ev.id, q.customer_id, ev.id,
            'Booking held for approval — ' || case when v_mode = 'all' then 'every booking needs approval'
              else 'event is ' || case when v_away <= 0 then 'today or earlier' when v_away = 1 then 'tomorrow' else 'in ' || v_away || ' days' end
                   || ' (approval needed within ' || v_days || ' days)' end);
    return;
  end if;

  perform public._complete_booking(q.id);
end $$;
revoke all on function public.run_quote_accepted(uuid, text) from public, anon, authenticated;

-- Owner/admin approves a held booking: runs the acceptance automation now.
create or replace function public.approve_booking(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev public.events%rowtype;
  v_quote uuid;
  v_name text;
begin
  select * into ev from public.events where id = p_event_id for update;
  if ev.id is null then raise exception 'Event not found'; end if;
  if not exists (select 1 from public.organisation_users where organisation_id = ev.organisation_id and user_id = auth.uid() and role in ('owner','admin')) then
    raise exception 'Only owners and admins can approve bookings';
  end if;
  if ev.approval_status is distinct from 'pending' then raise exception 'This booking isn''t waiting for approval'; end if;
  select id into v_quote from public.quotes where event_id = ev.id and status = 'accepted' order by updated_at desc limit 1;
  if v_quote is null then raise exception 'There''s no accepted quote on this event'; end if;
  select coalesce(nullif(trim(full_name), ''), email) into v_name from public.users where id = auth.uid();

  update public.events set approval_status = 'approved', approval_decided_at = now(), approval_decided_by = auth.uid(),
    next_action = null, next_action_due = null where id = ev.id;
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
  values (ev.organisation_id, auth.uid(), 'user', v_name, 'event.approved', 'event', ev.id, ev.customer_id, ev.id, coalesce(v_name, 'Someone') || ' approved the booking');
  update public.notifications set read_at = coalesce(read_at, now()) where type = 'booking.approval' and entity_id = ev.id;

  perform public._complete_booking(v_quote);
  -- No "Quote accepted" automation: approval still confirms the event.
  update public.events set status = 'confirmed' where id = ev.id and status not in ('confirmed','completed','cancelled');
  return jsonb_build_object('event_id', ev.id);
end $$;
revoke all on function public.approve_booking(uuid) from public, anon;
grant execute on function public.approve_booking(uuid) to authenticated;

-- Who to email about a held booking (owners/admins), once per request. Callable by the office or the event's customer.
create or replace function public.booking_approval_alert(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
          or ev.customer_id in (select public.portal_customer_ids())) then
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
end $$;
revoke all on function public.booking_approval_alert(uuid) from public, anon;
grant execute on function public.booking_approval_alert(uuid) to authenticated;
