-- =====================================================================
-- EventureOS 0048 — Don't raise a second invoice for a job that already has one
--   When a quote is accepted, the automatic deposit/full invoice is now skipped if the job already
--   has a live invoice — e.g. one raised in Xero and linked to the job — not only one from this quote.
-- Safe to run more than once.
-- =====================================================================
create or replace function public._complete_booking(p_quote_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
     and not exists (select 1 from public.invoices where (quote_id = q.id or event_id = ev.id) and status <> 'void') then
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
end $function$;
