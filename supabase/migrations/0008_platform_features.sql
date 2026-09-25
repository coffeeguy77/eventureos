-- =====================================================================
-- EventureOS 0008 — customer portal, quote publishing, automation engine,
-- website capture, integration credentials, import review, invitations,
-- platform support sessions, document storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Membership expiry (used for time-limited support sessions)
-- ---------------------------------------------------------------------
alter table public.organisation_users add column if not exists expires_at timestamptz;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisation_users ou
    where ou.organisation_id = org
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and (ou.expires_at is null or ou.expires_at > now())
      and ou.role = any(roles));
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function public.org_today(org uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.organisations where id = org), 'Australia/Sydney'))::date;
$$;

-- ---------------------------------------------------------------------
-- Team invitations (no admin API needed: accepted on sign-in by email)
-- ---------------------------------------------------------------------
create table public.organisation_invitations (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email           text not null check (position('@' in email) > 1),
  role            public.org_role not null default 'staff' check (role in ('admin','manager','staff')),
  invited_by      uuid references public.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  accepted_by     uuid references public.users(id)
);
create unique index organisation_invitations_pending on public.organisation_invitations (organisation_id, lower(email)) where accepted_at is null;
alter table public.organisation_invitations enable row level security;
create policy invitations_select on public.organisation_invitations for select to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
create policy invitations_insert on public.organisation_invitations for insert to authenticated
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
create policy invitations_delete on public.organisation_invitations for delete to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));

create or replace function public.accept_my_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  n integer := 0;
  inv record;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  for inv in select * from public.organisation_invitations where lower(email) = v_email and accepted_at is null loop
    insert into public.organisation_users (organisation_id, user_id, role, created_by)
    values (inv.organisation_id, auth.uid(), inv.role, inv.invited_by)
    on conflict (organisation_id, user_id) do update set role = excluded.role, status = 'active', expires_at = null
      where public.organisation_users.role = 'customer';
    update public.organisation_invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
    insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
    values (inv.organisation_id, auth.uid(), 'team.joined', 'user', auth.uid(),
            coalesce((select full_name from public.users where id = auth.uid()), v_email) || ' joined the team as ' || inv.role);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Website enquiry form key
-- ---------------------------------------------------------------------
alter table public.organisations
  add column if not exists public_form_key text not null default encode(extensions.gen_random_bytes(18), 'hex');

-- ---------------------------------------------------------------------
-- Customer portal: which customers does the signed-in portal user represent?
-- ---------------------------------------------------------------------
create or replace function public.portal_customer_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ct.customer_id from public.contacts ct
  join public.organisation_users ou on ou.organisation_id = ct.organisation_id and ou.user_id = auth.uid() and ou.status = 'active'
  where ct.portal_user_id = auth.uid();
$$;

create policy customers_portal_select on public.customers for select to authenticated
  using (id in (select public.portal_customer_ids()));
create policy contacts_portal_select on public.contacts for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));
create policy events_portal_select on public.events for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));
create policy quotes_portal_select on public.quotes for select to authenticated
  using (customer_id in (select public.portal_customer_ids()) and status <> 'draft');
create policy quote_versions_portal_select on public.quote_versions for select to authenticated
  using (quote_id in (select q.id from public.quotes q where q.customer_id in (select public.portal_customer_ids())));
create policy invoices_portal_select on public.invoices for select to authenticated
  using (customer_id in (select public.portal_customer_ids()) and status <> 'draft');
create policy payments_portal_select on public.payments for select to authenticated
  using (invoice_id in (select i.id from public.invoices i where i.customer_id in (select public.portal_customer_ids())));
create policy documents_portal_select on public.documents for select to authenticated
  using (visibility = 'customer' and customer_id in (select public.portal_customer_ids()));

-- Portal messages (customer <-> business), kept separate from Gmail threads
create table public.portal_messages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  event_id        uuid,
  author_id       uuid references public.users(id) default auth.uid(),
  author_type     text not null check (author_type in ('customer','staff')),
  body            text not null check (length(trim(body)) between 1 and 5000),
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete cascade
);
create index on public.portal_messages (organisation_id, customer_id, created_at);
alter table public.portal_messages enable row level security;
create policy portal_messages_staff on public.portal_messages for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id) and author_type = 'staff' and author_id = auth.uid());
create policy portal_messages_customer_select on public.portal_messages for select to authenticated
  using (customer_id in (select public.portal_customer_ids()));
create policy portal_messages_customer_insert on public.portal_messages for insert to authenticated
  with check (customer_id in (select public.portal_customer_ids()) and author_type = 'customer' and author_id = auth.uid());

create or replace function public.on_portal_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.author_type = 'customer' then
    select name into v_name from public.customers where id = new.customer_id;
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (new.organisation_id, 'customer.message', coalesce(v_name, 'Customer') || ' sent a portal message', left(new.body, 140),
            case when new.event_id is not null then '/events/' || new.event_id || '?tab=communication' else '/clients/' || new.customer_id end,
            'customer', new.customer_id);
    insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (new.organisation_id, new.author_id, 'customer', v_name, 'portal.message', 'portal_message', new.id, new.customer_id, new.event_id,
            coalesce(v_name, 'Customer') || ' asked a question in the portal');
  end if;
  return new;
end $$;
create trigger portal_messages_notify after insert on public.portal_messages for each row execute function public.on_portal_message();

-- A signed-in, email-verified person claims portal access to their bookings
create or replace function public.portal_claim_access(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_email text;
begin
  select id into v_org from public.organisations where slug = lower(p_slug) and status = 'active';
  if v_org is null then raise exception 'Unknown business'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Please verify your email first'; end if;

  -- Link contacts with this verified email address
  update public.contacts set portal_user_id = auth.uid()
  where organisation_id = v_org and lower(email) = v_email and (portal_user_id is null or portal_user_id = auth.uid());

  -- Customers whose main email matches but who have no matching contact yet
  insert into public.contacts (organisation_id, customer_id, first_name, email, is_primary, portal_user_id)
  select c.organisation_id, c.id, split_part(c.name, ' ', 1), c.email, false, auth.uid()
  from public.customers c
  where c.organisation_id = v_org and lower(c.email) = v_email
    and not exists (select 1 from public.contacts ct where ct.customer_id = c.id and ct.portal_user_id = auth.uid());

  if exists (select 1 from public.contacts where organisation_id = v_org and portal_user_id = auth.uid()) then
    insert into public.organisation_users (organisation_id, user_id, role)
    values (v_org, auth.uid(), 'customer')
    on conflict (organisation_id, user_id) do nothing;
    return jsonb_build_object('linked', true, 'organisation_id', v_org);
  end if;
  return jsonb_build_object('linked', false, 'organisation_id', v_org);
end $$;

-- Public branding for the portal sign-in page (no private data)
create or replace function public.portal_branding(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', name, 'slug', slug, 'logo_url', logo_url, 'brand_colour', brand_colour,
                            'contact_email', contact_email, 'contact_phone', contact_phone, 'website', website)
  from public.organisations where slug = lower(p_slug) and status = 'active';
$$;

-- ---------------------------------------------------------------------
-- Quotes: snapshot, publish, draft-change tracking
-- ---------------------------------------------------------------------
create or replace function public.build_quote_snapshot(qid uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'title', q.title, 'notes', q.notes, 'terms', q.terms,
    'issue_date', q.issue_date, 'expiry_date', q.expiry_date,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title, 'description', s.description, 'optional', s.is_optional,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', i.name, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
            'unit_price', i.unit_price, 'tax_rate', i.tax_rate, 'discount_percent', i.discount_percent,
            'optional', i.is_optional or s.is_optional, 'package', i.is_package, 'image_url', i.image_url,
            'line_total', i.line_total) order by i.position)
          from public.quote_items i where i.section_id = s.id), '[]'::jsonb)) order by s.position)
      from public.quote_sections s where s.quote_id = q.id), '[]'::jsonb),
    'subtotal', t.sub, 'tax_total', t.tax, 'total', t.sub + t.tax)
  from public.quotes q,
  lateral (
    select coalesce(round(sum(i.line_total), 2), 0) as sub,
           coalesce(round(sum(i.line_total * i.tax_rate / 100), 2), 0) as tax
    from public.quote_items i
    left join public.quote_sections s on s.id = i.section_id
    where i.quote_id = q.id and not i.is_optional and not coalesce(s.is_optional, false)
  ) t
  where q.id = qid;
$$;

create or replace function public.publish_quote(p_quote_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  q public.quotes%rowtype;
  v_snap jsonb;
  v_num integer;
  v_version uuid;
  v_actor text;
  v_ev public.events%rowtype;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found or you do not have access'; end if;
  if not exists (select 1 from public.quote_items where quote_id = q.id) then
    raise exception 'Add at least one line item before sending the quote';
  end if;
  if q.status in ('accepted') then raise exception 'This quote has already been accepted'; end if;

  select coalesce(full_name, email) into v_actor from public.users where id = auth.uid();
  update public.quotes set issue_date = public.org_today(q.organisation_id) where id = q.id;
  v_snap := public.build_quote_snapshot(q.id);
  select coalesce(max(version_number), 0) + 1 into v_num from public.quote_versions where quote_id = q.id;

  update public.quote_versions set status = 'superseded'
  where quote_id = q.id and status in ('sent','viewed','declined','expired');

  insert into public.quote_versions (organisation_id, quote_id, version_number, snapshot, subtotal, tax_total, total, status, published_by)
  values (q.organisation_id, q.id, v_num, v_snap, (v_snap->>'subtotal')::numeric, (v_snap->>'tax_total')::numeric,
          (v_snap->>'total')::numeric, 'sent', auth.uid())
  returning id into v_version;

  update public.quotes set status = 'sent', current_version_id = v_version, has_unpublished_changes = false where id = q.id;

  select * into v_ev from public.events where id = q.event_id;
  update public.events set status = 'awaiting_approval', next_action = null, next_action_due = null
  where id = q.event_id and status in ('enquiry','planning','quoted');
  if v_ev.enquiry_id is not null then
    update public.enquiries set status = 'quote_sent', last_contact_at = now()
    where id = v_ev.enquiry_id and status in ('new','needs_review','contacted','qualified','quote_required','negotiating');
  end if;

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary)
  values (q.organisation_id, auth.uid(), 'quote.sent', 'quote', q.id, q.customer_id, q.event_id, v_ev.enquiry_id,
          coalesce(v_actor, 'Someone') || ' sent Quote Q-' || q.number || ' (version ' || v_num || ', ' ||
          to_char((v_snap->>'total')::numeric, 'FM$999,999,990.00') || ')');
  return v_version;
end $$;

create or replace function public.mark_quote_dirty()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.quotes set has_unpublished_changes = true
  where id = coalesce(new.quote_id, old.quote_id) and not has_unpublished_changes;
  return coalesce(new, old);
end $$;
create trigger quote_items_dirty after insert or update or delete on public.quote_items for each row execute function public.mark_quote_dirty();
create trigger quote_sections_dirty after insert or update or delete on public.quote_sections for each row execute function public.mark_quote_dirty();

create or replace function public.quotes_track_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.title, new.notes, new.terms, new.expiry_date) is distinct from (old.title, old.notes, old.terms, old.expiry_date)
     and new.has_unpublished_changes is not distinct from old.has_unpublished_changes then
    new.has_unpublished_changes := true;
  end if;
  return new;
end $$;
create trigger quotes_track_changes before update on public.quotes for each row execute function public.quotes_track_changes();

-- ---------------------------------------------------------------------
-- Automation: quote accepted
-- ---------------------------------------------------------------------
create or replace function public.run_quote_accepted(p_quote_id uuid, p_actor_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype;
  v public.quote_versions%rowtype;
  ev public.events%rowtype;
  o public.organisations%rowtype;
  v_rule public.automation_rules%rowtype;
  v_action text;
  v_pct numeric;
  v_terms integer;
  v_cal uuid;
  v_inv uuid;
  v_inv_number text;
  v_amount numeric;
  v_start timestamptz;
  v_end timestamptz;
  v_done jsonb := '[]'::jsonb;
begin
  select * into q from public.quotes where id = p_quote_id;
  select * into v from public.quote_versions where id = q.current_version_id;
  select * into ev from public.events where id = q.event_id;
  select * into o from public.organisations where id = q.organisation_id;

  if ev.enquiry_id is not null then
    update public.enquiries set status = 'won' where id = ev.enquiry_id and status not in ('won','archived');
  end if;

  select * into v_rule from public.automation_rules
  where organisation_id = q.organisation_id and trigger_type = 'quote.accepted' and enabled
  order by created_at limit 1;

  insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
  values (q.organisation_id, null, 'quote.accepted', 'Quote Q-' || q.number || ' accepted',
          coalesce(p_actor_label, 'Customer') || ' accepted ' || to_char(v.total, 'FM$999,999,990.00') || ' — ' || ev.name,
          '/events/' || ev.id || '?tab=quote', 'quote', q.id);

  if v_rule.id is null then
    return; -- automation switched off: acceptance is recorded, nothing else happens
  end if;

  -- 1. Confirm the event
  if ev.status not in ('confirmed','completed','cancelled') then
    update public.events set status = 'confirmed', next_action = null, next_action_due = null where id = ev.id;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary, changes)
    values (q.organisation_id, 'system', 'Automation', 'event.status_changed', 'event', ev.id, q.customer_id, ev.id, ev.enquiry_id,
            'Event confirmed', jsonb_build_object('status', jsonb_build_array(ev.status, 'confirmed')));
    v_done := v_done || '"confirmed_event"'::jsonb;
  end if;

  -- 2. Put it on the calendar (default resource) if it isn't already
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

  -- 3. Raise the configured invoice
  v_action := coalesce(o.settings->>'quote_acceptance_action', 'deposit_invoice');
  v_pct := coalesce((o.settings->>'deposit_percent')::numeric, 30);
  v_terms := coalesce((o.settings->>'default_payment_terms_days')::integer, 14);
  if v_action in ('deposit_invoice','full_invoice')
     and not exists (select 1 from public.invoices where quote_id = q.id and status <> 'void') then
    v_amount := case when v_action = 'deposit_invoice' then round(v.total * v_pct / 100, 2) else v.total end;
    insert into public.invoices (organisation_id, customer_id, event_id, quote_id, kind, issue_date, due_date,
                                 subtotal, tax_total, total, status)
    values (q.organisation_id, q.customer_id, ev.id, q.id,
            case when v_action = 'deposit_invoice' then 'deposit' else 'full' end,
            public.org_today(q.organisation_id), public.org_today(q.organisation_id) + v_terms,
            round(v_amount / 1.1, 2), v_amount - round(v_amount / 1.1, 2), v_amount, 'awaiting_payment')
    returning id, number into v_inv, v_inv_number;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (q.organisation_id, 'system', 'Automation', 'invoice.created', 'invoice', v_inv, q.customer_id, ev.id,
            case when v_action = 'deposit_invoice' then 'Deposit invoice ' else 'Invoice ' end || v_inv_number || ' generated');
    v_done := v_done || '"invoice"'::jsonb;
  end if;

  -- 4. Tell the assigned team
  if ev.assigned_to is not null then
    insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
    values (q.organisation_id, ev.assigned_to, 'event.confirmed', ev.name || ' is confirmed',
            'Quote accepted — calendar and invoice handled automatically', '/events/' || ev.id, 'event', ev.id);
  end if;

  insert into public.automation_runs (organisation_id, rule_id, trigger_payload, status, result)
  values (q.organisation_id, v_rule.id, jsonb_build_object('quote_id', q.id, 'event_id', ev.id), 'success', jsonb_build_object('actions', v_done));
end $$;
revoke all on function public.run_quote_accepted(uuid, text) from public, anon, authenticated;

-- Shared response logic (portal or staff-recorded)
create or replace function public._record_quote_response(p_version_id uuid, p_decision text, p_name text, p_reason text,
  p_ip text, p_user_agent text, p_actor_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.quote_versions%rowtype;
  q public.quotes%rowtype;
  v_inet inet;
begin
  if p_decision not in ('accepted','declined') then raise exception 'Invalid decision'; end if;
  select * into v from public.quote_versions where id = p_version_id for update;
  select * into q from public.quotes where id = v.quote_id for update;
  if q.current_version_id is distinct from v.id then raise exception 'This quote has been updated — please review the latest version'; end if;
  if v.status not in ('sent','viewed') then raise exception 'This quote has already been %', v.status; end if;
  if q.expiry_date is not null and q.expiry_date < public.org_today(q.organisation_id) then
    raise exception 'This quote expired on %', to_char(q.expiry_date, 'DD Mon YYYY');
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
end $$;
revoke all on function public._record_quote_response(uuid, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.try_inet(p text)
returns inet language plpgsql immutable set search_path = '' as $$
begin
  return nullif(trim(p), '')::inet;
exception when others then
  return null;
end $$;

-- Customer responds from the portal
create or replace function public.portal_respond_to_quote(p_version_id uuid, p_decision text, p_name text, p_reason text, p_ip text, p_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.quote_versions v join public.quotes q on q.id = v.quote_id
    where v.id = p_version_id and q.customer_id in (select public.portal_customer_ids())
  ) then
    raise exception 'Quote not found';
  end if;
  perform public._record_quote_response(p_version_id, p_decision, p_name, p_reason, p_ip, p_user_agent, 'customer');
end $$;

-- Staff record a verbal / emailed acceptance
create or replace function public.staff_record_quote_response(p_version_id uuid, p_decision text, p_name text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.quote_versions v where v.id = p_version_id and public.is_org_staff(v.organisation_id)
  ) then
    raise exception 'Quote not found';
  end if;
  perform public._record_quote_response(p_version_id, p_decision, p_name, p_reason, null, 'Recorded by staff', 'user');
end $$;

-- Customer opened the quote
create or replace function public.portal_mark_quote_viewed(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.quote_versions%rowtype; q public.quotes%rowtype; v_name text;
begin
  select * into v from public.quote_versions where id = p_version_id;
  select * into q from public.quotes where id = v.quote_id;
  if q.customer_id not in (select public.portal_customer_ids()) then raise exception 'Quote not found'; end if;
  if v.viewed_at is null then
    select coalesce(full_name, email) into v_name from public.users where id = auth.uid();
    update public.quote_versions set viewed_at = now(), status = case when status = 'sent' then 'viewed'::public.quote_status else status end where id = v.id;
    update public.quotes set status = 'viewed' where id = q.id and status = 'sent';
    insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (q.organisation_id, auth.uid(), 'customer', v_name, 'quote.viewed', 'quote', q.id, q.customer_id, q.event_id, 'Customer viewed quote');
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (q.organisation_id, 'quote.viewed', 'Quote Q-' || q.number || ' viewed', coalesce(v_name, 'Customer') || ' opened the quote',
            '/events/' || q.event_id || '?tab=quote', 'quote', q.id);
  end if;
end $$;

-- Customer uploads a requested document (file already stored in Storage)
create or replace function public.portal_add_document(p_customer_id uuid, p_event_id uuid, p_request_id uuid, p_name text, p_path text, p_mime text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  if p_customer_id not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  select organisation_id into v_org from public.customers where id = p_customer_id;
  if split_part(p_path, '/', 1) <> v_org::text or split_part(p_path, '/', 2) <> 'portal' then raise exception 'Invalid file location'; end if;
  if p_request_id is not null then
    update public.documents set name = p_name, storage_path = p_path, mime_type = p_mime, size_bytes = p_size,
      requested_from_customer = false, uploaded_by = auth.uid(), updated_at = now()
    where id = p_request_id and customer_id = p_customer_id and requested_from_customer
    returning id into v_id;
  end if;
  if v_id is null then
    insert into public.documents (organisation_id, name, storage_path, mime_type, size_bytes, customer_id, event_id, visibility, uploaded_by)
    values (v_org, p_name, p_path, p_mime, p_size, p_customer_id, p_event_id, 'customer', auth.uid())
    returning id into v_id;
  end if;
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (v_org, 'document.uploaded', 'Customer uploaded a document', p_name,
          coalesce('/events/' || p_event_id || '?tab=documents', '/clients/' || p_customer_id), 'document', v_id);
  insert into public.activity_logs (organisation_id, actor_id, actor_type, action, entity_type, entity_id, customer_id, event_id, summary)
  values (v_org, auth.uid(), 'customer', 'document.uploaded', 'document', v_id, p_customer_id, p_event_id, 'Customer uploaded ' || p_name);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Scheduled automations (run by pg_cron every 15 minutes)
-- ---------------------------------------------------------------------
create or replace function public.run_scheduled_automations()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n_follow integer := 0;
  n_overdue integer := 0;
  n_expired integer := 0;
  v_task uuid;
begin
  -- Quotes with no reply after N days → follow-up task
  for r in
    select q.id as quote_id, q.number, q.organisation_id, q.customer_id, q.event_id, ev.assigned_to, ev.name as event_name,
           v.published_at, rule.id as rule_id
    from public.quotes q
    join public.quote_versions v on v.id = q.current_version_id and v.status in ('sent','viewed')
    join public.events ev on ev.id = q.event_id
    join public.organisations o on o.id = q.organisation_id
    join lateral (select id from public.automation_rules ar
                  where ar.organisation_id = q.organisation_id and ar.trigger_type = 'quote.no_reply' and ar.enabled limit 1) rule on true
    where v.published_at < now() - make_interval(days => coalesce((o.settings->>'quote_follow_up_days')::integer, 3))
      and not exists (select 1 from public.tasks t where t.event_id = q.event_id and t.title like 'Follow up quote%' and t.created_at > v.published_at)
  loop
    insert into public.tasks (organisation_id, title, priority, due_at, assigned_to, customer_id, event_id)
    values (r.organisation_id, 'Follow up quote Q-' || r.number, 'high', now(), r.assigned_to, r.customer_id, r.event_id)
    returning id into v_task;
    update public.events set next_action = 'Follow up quote', next_action_due = now() where id = r.event_id and next_action is null;
    insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
    values (r.organisation_id, r.assigned_to, 'quote.follow_up', 'Follow up quote Q-' || r.number, r.event_name || ' — no reply yet',
            '/events/' || r.event_id || '?tab=quote', 'quote', r.quote_id);
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (r.organisation_id, 'system', 'Automation', 'automation.follow_up_flagged', 'quote', r.quote_id, r.customer_id, r.event_id,
            'Follow-up flagged — no reply to quote after ' || (extract(day from now() - r.published_at))::int || ' days');
    insert into public.automation_runs (organisation_id, rule_id, trigger_payload, status, result)
    values (r.organisation_id, r.rule_id, jsonb_build_object('quote_id', r.quote_id), 'success', jsonb_build_object('task_id', v_task));
    n_follow := n_follow + 1;
  end loop;

  -- Invoices past due → overdue
  for r in
    select i.id, i.number, i.organisation_id, i.customer_id, i.event_id, c.name as customer_name, i.balance
    from public.invoices i join public.customers c on c.id = i.customer_id
    where i.status in ('awaiting_payment','part_paid') and i.balance > 0 and i.due_date < public.org_today(i.organisation_id)
      and i.xero_invoice_id is null  -- Xero-managed invoices take their status from Xero
  loop
    update public.invoices set status = 'overdue' where id = r.id;
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (r.organisation_id, 'invoice.overdue', 'Invoice ' || r.number || ' overdue', r.customer_name || ' — ' || to_char(r.balance, 'FM$999,999,990.00') || ' outstanding',
            coalesce('/events/' || r.event_id || '?tab=invoice', '/invoices'), 'invoice', r.id);
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (r.organisation_id, 'system', 'Automation', 'invoice.overdue', 'invoice', r.id, r.customer_id, r.event_id, 'Invoice ' || r.number || ' is overdue');
    n_overdue := n_overdue + 1;
  end loop;

  -- Quotes past expiry → expired
  for r in
    select q.id, q.number, q.organisation_id, q.customer_id, q.event_id, q.current_version_id
    from public.quotes q join public.quote_versions v on v.id = q.current_version_id
    where v.status in ('sent','viewed') and q.expiry_date is not null and q.expiry_date < public.org_today(q.organisation_id)
  loop
    update public.quote_versions set status = 'expired' where id = r.current_version_id;
    update public.quotes set status = 'expired' where id = r.id;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, summary)
    values (r.organisation_id, 'system', 'Automation', 'quote.expired', 'quote', r.id, r.customer_id, r.event_id, 'Quote Q-' || r.number || ' expired');
    n_expired := n_expired + 1;
  end loop;

  return jsonb_build_object('follow_ups', n_follow, 'overdue_invoices', n_overdue, 'expired_quotes', n_expired, 'ran_at', now());
end $$;
revoke all on function public.run_scheduled_automations() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Website enquiry capture (public, protected by a per-organisation key)
-- ---------------------------------------------------------------------
create or replace function public.capture_website_enquiry(p_slug text, p_key text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organisations%rowtype;
  v_email text := lower(nullif(trim(p_payload->>'email'), ''));
  v_name text := left(nullif(trim(p_payload->>'name'), ''), 200);
  v_msg text := left(nullif(trim(p_payload->>'message'), ''), 5000);
  v_customer uuid;
  v_contact uuid;
  v_id uuid;
  v_number integer;
  v_assignee uuid;
  v_date date;
begin
  select * into o from public.organisations where slug = lower(p_slug) and status = 'active';
  if o.id is null or o.public_form_key is distinct from p_key then raise exception 'Invalid form key'; end if;
  if v_name is null and v_email is null then raise exception 'Name or email is required'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;
  -- simple flood protection: max 20 website enquiries per org per 10 minutes
  if (select count(*) from public.enquiries where organisation_id = o.id and source = 'website' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Too many enquiries — please try again shortly';
  end if;

  begin v_date := nullif(p_payload->>'event_date', '')::date; exception when others then v_date := null; end;

  if v_email is not null then
    select id, customer_id into v_contact, v_customer from public.contacts where organisation_id = o.id and lower(email) = v_email limit 1;
    if v_customer is null then
      select id into v_customer from public.customers where organisation_id = o.id and lower(email) = v_email limit 1;
    end if;
  end if;

  if exists (select 1 from public.automation_rules where organisation_id = o.id and trigger_type = 'enquiry.created' and enabled) then
    select ou.user_id into v_assignee from public.organisation_users ou
    left join public.enquiries e on e.assigned_to = ou.user_id and e.organisation_id = o.id and e.status in ('new','needs_review','contacted','qualified','quote_required')
    where ou.organisation_id = o.id and ou.status = 'active' and ou.role in ('owner','admin','manager','staff') and ou.expires_at is null
    group by ou.user_id order by count(e.id), min(ou.created_at) limit 1;
  end if;

  insert into public.enquiries (organisation_id, customer_id, contact_id, title, contact_name, contact_email, contact_phone, company,
                                event_type, event_date, guest_count, budget, venue, message, source, status, classification,
                                classification_confidence, assigned_to, received_at, next_action, next_action_due)
  values (o.id, v_customer, v_contact,
          left(coalesce(nullif(trim(p_payload->>'title'), ''), nullif(trim(p_payload->>'event_type'), '') || ' enquiry', 'Website enquiry'), 200),
          v_name, v_email, left(nullif(trim(p_payload->>'phone'), ''), 40), left(nullif(trim(p_payload->>'company'), ''), 200),
          left(nullif(trim(p_payload->>'event_type'), ''), 80), v_date,
          public.try_int(p_payload->>'guests'), public.try_numeric(p_payload->>'budget'),
          left(nullif(trim(p_payload->>'venue'), ''), 200), v_msg, 'website', 'new', 'event_enquiry', 0.99, v_assignee, now(),
          'Reply to the enquiry', now() + interval '4 hours')
  returning id, number into v_id, v_number;

  insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, enquiry_id, customer_id, summary)
  values (o.id, 'system', 'Website form', 'enquiry.received', 'enquiry', v_id, v_id, v_customer,
          'Enquiry received — ' || coalesce(v_name, v_email) || ' via website form');
  insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
  values (o.id, null, 'enquiry.new', 'New enquiry from ' || coalesce(v_name, v_email), left(coalesce(v_msg, ''), 140), '/enquiries/' || v_id, 'enquiry', v_id);
  return jsonb_build_object('ok', true, 'reference', 'ENQ-' || v_number);
end $$;

create or replace function public.try_int(p text) returns integer language plpgsql immutable set search_path = '' as $$
begin return nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '')::integer; exception when others then return null; end $$;
create or replace function public.try_numeric(p text) returns numeric language plpgsql immutable set search_path = '' as $$
begin return nullif(regexp_replace(coalesce(p, ''), '[^0-9.]', '', 'g'), '')::numeric; exception when others then return null; end $$;

grant execute on function public.capture_website_enquiry(text, text, jsonb) to anon, authenticated;
grant execute on function public.portal_branding(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Integration credentials (tokens never readable through table access)
-- ---------------------------------------------------------------------
create or replace function public.save_integration_connection(
  p_org uuid, p_provider text, p_account_label text, p_external_account_id text, p_scopes text[],
  p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_settings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_org_manager(p_org) then raise exception 'Only owners, admins and managers can connect integrations'; end if;
  insert into public.integrations (organisation_id, provider, status, account_label, external_account_id, scopes, settings,
                                   connected_at, connected_by, last_error)
  values (p_org, p_provider, 'connected', p_account_label, p_external_account_id, coalesce(p_scopes, '{}'), coalesce(p_settings, '{}'),
          now(), auth.uid(), null)
  on conflict (organisation_id, provider) do update set
    status = 'connected', account_label = excluded.account_label, external_account_id = excluded.external_account_id,
    scopes = excluded.scopes, settings = public.integrations.settings || excluded.settings,
    connected_at = now(), connected_by = auth.uid(), last_error = null
  returning id into v_id;
  insert into public.integration_credentials (integration_id, access_token, refresh_token, expires_at, updated_at)
  values (v_id, p_access_token, p_refresh_token, p_expires_at, now())
  on conflict (integration_id) do update set access_token = excluded.access_token,
    refresh_token = coalesce(excluded.refresh_token, public.integration_credentials.refresh_token),
    expires_at = excluded.expires_at, updated_at = now();
  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (p_org, auth.uid(), 'integration.connected', 'integration', v_id,
          coalesce((select full_name from public.users where id = auth.uid()), 'Someone') || ' connected ' || p_provider || coalesce(' (' || p_account_label || ')', ''));
  return v_id;
end $$;

create or replace function public.get_integration_tokens(p_integration_id uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.integrations i where i.id = p_integration_id and public.is_org_staff(i.organisation_id)) then
    raise exception 'Integration not found';
  end if;
  return query select c.access_token, c.refresh_token, c.expires_at from public.integration_credentials c where c.integration_id = p_integration_id;
end $$;

create or replace function public.update_integration_access_token(p_integration_id uuid, p_access_token text, p_expires_at timestamptz, p_refresh_token text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.integrations i where i.id = p_integration_id and public.is_org_staff(i.organisation_id)) then
    raise exception 'Integration not found';
  end if;
  update public.integration_credentials set access_token = p_access_token, expires_at = p_expires_at,
    refresh_token = coalesce(p_refresh_token, refresh_token), updated_at = now()
  where integration_id = p_integration_id;
end $$;

create or replace function public.disconnect_integration(p_integration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_provider text;
begin
  select organisation_id, provider into v_org, v_provider from public.integrations where id = p_integration_id;
  if v_org is null or not public.is_org_manager(v_org) then raise exception 'Integration not found'; end if;
  delete from public.integration_credentials where integration_id = p_integration_id;
  update public.integrations set status = 'disconnected', last_sync_status = null where id = p_integration_id;
  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (v_org, auth.uid(), 'integration.disconnected', 'integration', p_integration_id,
          coalesce((select full_name from public.users where id = auth.uid()), 'Someone') || ' disconnected ' || v_provider);
end $$;

-- Integrations can be updated (sync status, settings) by staff running a sync
drop policy if exists integrations_update on public.integrations;
create policy integrations_update on public.integrations for update to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

-- ---------------------------------------------------------------------
-- Import / match review (Gmail history, Xero contacts & invoices)
-- ---------------------------------------------------------------------
create table public.import_candidates (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  source                text not null check (source in ('gmail','xero')),
  kind                  text not null check (kind in ('contact','enquiry','event','invoice')),
  external_id           text not null,
  payload               jsonb not null,
  suggested_customer_id uuid,
  score                 numeric(5,2),
  reasons               text[] not null default '{}',
  status                text not null default 'pending' check (status in ('pending','merged','kept_separate','created','ignored')),
  result_customer_id    uuid,
  resolved_by           uuid references public.users(id),
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  unique (organisation_id, source, kind, external_id),
  foreign key (suggested_customer_id, organisation_id) references public.customers(id, organisation_id) on delete set null (suggested_customer_id),
  foreign key (result_customer_id, organisation_id) references public.customers(id, organisation_id) on delete set null (result_customer_id)
);
create index on public.import_candidates (organisation_id, status);
alter table public.import_candidates enable row level security;
create policy import_candidates_select on public.import_candidates for select to authenticated using (public.is_org_staff(organisation_id));
create policy import_candidates_insert on public.import_candidates for insert to authenticated with check (public.is_org_staff(organisation_id));
create policy import_candidates_update on public.import_candidates for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
create policy import_candidates_delete on public.import_candidates for delete to authenticated using (public.is_org_manager(organisation_id));

-- ---------------------------------------------------------------------
-- Platform administration & audited support access
-- ---------------------------------------------------------------------
create or replace function public.admin_platform_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'organisations', (select count(*) from public.organisations),
    'active_organisations', (select count(*) from public.organisations o where o.status = 'active'
                              and exists (select 1 from public.activity_logs a where a.organisation_id = o.id and a.created_at > now() - interval '30 days')),
    'users', (select count(*) from public.users),
    'events', (select count(*) from public.events),
    'emails_processed', (select count(*) from public.email_messages),
    'quotes', (select count(*) from public.quote_versions),
    'mrr', (select coalesce(sum(case plan when 'starter' then 49 when 'growth' then 99 when 'scale' then 199 else 0 end), 0) from public.organisations where status = 'active'),
    'integrations', (select coalesce(jsonb_object_agg(provider || ':' || status, n), '{}'::jsonb)
                     from (select provider, status, count(*) n from public.integrations group by 1, 2) x)
  );
end $$;

create or replace function public.admin_organisations()
returns table (id uuid, name text, slug text, plan text, status text, created_at timestamptz, owner_name text, owner_email text,
               users bigint, events bigint, storage_bytes bigint, integrations text[], last_activity timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  return query
  select o.id, o.name, o.slug, o.plan, o.status, o.created_at,
         (select u.full_name from public.organisation_users ou join public.users u on u.id = ou.user_id where ou.organisation_id = o.id and ou.role = 'owner' limit 1),
         (select u.email from public.organisation_users ou join public.users u on u.id = ou.user_id where ou.organisation_id = o.id and ou.role = 'owner' limit 1),
         (select count(*) from public.organisation_users ou where ou.organisation_id = o.id and ou.role <> 'customer' and ou.expires_at is null),
         (select count(*) from public.events e where e.organisation_id = o.id),
         (select coalesce(sum(d.size_bytes), 0)::bigint from public.documents d where d.organisation_id = o.id),
         (select coalesce(array_agg(i.provider order by i.provider), '{}') from public.integrations i where i.organisation_id = o.id and i.status = 'connected'),
         (select max(a.created_at) from public.activity_logs a where a.organisation_id = o.id)
  from public.organisations o order by o.created_at;
end $$;

create or replace function public.admin_set_organisation_status(p_org uuid, p_status text, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  update public.organisations set status = coalesce(p_status, status), plan = coalesce(p_plan, plan) where id = p_org;
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, summary, impersonated_by)
  values (p_org, auth.uid(), 'system', 'EventureOS Support', 'platform.organisation_updated', 'organisation', p_org,
          'Platform admin set status ' || coalesce(p_status, '—') || ', plan ' || coalesce(p_plan, '—'), auth.uid());
end $$;

create or replace function public.admin_start_support_session(p_org uuid, p_reason text, p_minutes integer default 60)
returns void language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz := now() + make_interval(mins => least(greatest(coalesce(p_minutes, 60), 5), 240));
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for support access'; end if;
  if exists (select 1 from public.organisation_users where organisation_id = p_org and user_id = auth.uid() and expires_at is null) then
    raise exception 'You are already a permanent member of this organisation';
  end if;
  insert into public.organisation_users (organisation_id, user_id, role, title, status, expires_at, created_by)
  values (p_org, auth.uid(), 'admin', 'EventureOS Support', 'active', v_until, auth.uid())
  on conflict (organisation_id, user_id) do update set role = 'admin', title = 'EventureOS Support', status = 'active', expires_at = v_until;
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, summary, impersonated_by, metadata)
  values (p_org, auth.uid(), 'system', 'EventureOS Support', 'support.session_started', 'organisation', p_org,
          'EventureOS support access started — ' || trim(p_reason), auth.uid(), jsonb_build_object('until', v_until));
end $$;

create or replace function public.admin_end_support_session(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  update public.organisation_users set expires_at = now(), status = 'disabled'
  where organisation_id = p_org and user_id = auth.uid() and title = 'EventureOS Support';
  insert into public.activity_logs (organisation_id, actor_id, actor_type, actor_label, action, entity_type, entity_id, summary, impersonated_by)
  values (p_org, auth.uid(), 'system', 'EventureOS Support', 'support.session_ended', 'organisation', p_org, 'EventureOS support access ended', auth.uid());
end $$;

-- Anything a support user does inside an organisation is tagged in the audit log
create or replace function public.tag_support_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.actor_id is not null and new.impersonated_by is null and exists (
    select 1 from public.organisation_users ou
    where ou.organisation_id = new.organisation_id and ou.user_id = new.actor_id and ou.title = 'EventureOS Support' and ou.expires_at is not null
  ) then
    new.impersonated_by := new.actor_id;
    new.summary := '[Support] ' || new.summary;
  end if;
  return new;
end $$;
create trigger activity_tag_support before insert on public.activity_logs for each row execute function public.tag_support_activity();

-- ---------------------------------------------------------------------
-- Document storage (private bucket, org-scoped paths: <org_id>/...)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;

create policy "documents: staff read/write own org" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'documents' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));
create policy "documents: portal read shared" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = name and d.visibility = 'customer'
      and d.customer_id in (select public.portal_customer_ids())));
create policy "documents: portal upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[2] = 'portal'
              and public.is_org_member(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function public.accept_my_invitations() from public, anon;
revoke all on function public.portal_claim_access(text) from public, anon;
revoke all on function public.publish_quote(uuid) from public, anon;
revoke all on function public.portal_respond_to_quote(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.staff_record_quote_response(uuid, text, text, text) from public, anon;
revoke all on function public.portal_mark_quote_viewed(uuid) from public, anon;
revoke all on function public.portal_add_document(uuid, uuid, uuid, text, text, text, bigint) from public, anon;
revoke all on function public.save_integration_connection(uuid, text, text, text, text[], text, text, timestamptz, jsonb) from public, anon;
revoke all on function public.get_integration_tokens(uuid) from public, anon;
revoke all on function public.update_integration_access_token(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.disconnect_integration(uuid) from public, anon;
revoke all on function public.admin_platform_stats() from public, anon;
revoke all on function public.admin_organisations() from public, anon;
revoke all on function public.admin_set_organisation_status(uuid, text, text) from public, anon;
revoke all on function public.admin_start_support_session(uuid, text, integer) from public, anon;
revoke all on function public.admin_end_support_session(uuid) from public, anon;
revoke all on function public.portal_customer_ids() from public, anon;
revoke all on function public.org_today(uuid) from public, anon;
revoke all on function public.on_portal_message() from public, anon, authenticated;
revoke all on function public.mark_quote_dirty() from public, anon, authenticated;
revoke all on function public.tag_support_activity() from public, anon, authenticated;
grant execute on function public.accept_my_invitations(), public.portal_claim_access(text), public.publish_quote(uuid),
  public.portal_respond_to_quote(uuid, text, text, text, text, text), public.staff_record_quote_response(uuid, text, text, text),
  public.portal_mark_quote_viewed(uuid), public.portal_add_document(uuid, uuid, uuid, text, text, text, bigint),
  public.save_integration_connection(uuid, text, text, text, text[], text, text, timestamptz, jsonb),
  public.get_integration_tokens(uuid), public.update_integration_access_token(uuid, text, timestamptz, text),
  public.disconnect_integration(uuid), public.admin_platform_stats(), public.admin_organisations(),
  public.admin_set_organisation_status(uuid, text, text), public.admin_start_support_session(uuid, text, integer),
  public.admin_end_support_session(uuid), public.portal_customer_ids(), public.org_today(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- Schedule the automation runner
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('eventureos-automations', '*/15 * * * *', 'select public.run_scheduled_automations()');
