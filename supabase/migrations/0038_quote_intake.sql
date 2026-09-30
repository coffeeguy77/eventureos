-- Quote intake: other systems (starting with LeadPages quote forms) send a finished online quote to EventureOS,
-- which creates (or matches) the customer, an enquiry, an event and a DRAFT quote with the same line items —
-- ready for the team to review and send. Server-to-server only: each connection has its own secret key,
-- stored here only as a SHA-256 hash.

create or replace function public.try_time(p text) returns time language plpgsql immutable as $$
begin return nullif(trim(p), '')::time; exception when others then return null; end $$;
create or replace function public.try_date(p text) returns date language plpgsql immutable as $$
begin return nullif(trim(p), '')::date; exception when others then return null; end $$;

create table if not exists public.inbound_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null default 'leadpages' check (provider in ('leadpages', 'custom')),
  label text not null default 'LeadPages quote form' check (char_length(label) <= 80),
  key_prefix text not null check (char_length(key_prefix) <= 20),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists inbound_connections_org_idx on public.inbound_connections (organisation_id);

create table if not exists public.inbound_deliveries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid not null references public.inbound_connections(id) on delete cascade,
  external_id text not null check (char_length(external_id) <= 200),
  external_version int not null default 1,
  stage text not null default 'submitted' check (stage in ('submitted', 'accepted')),
  outcome text not null check (outcome in ('created', 'updated', 'duplicate', 'accepted', 'review', 'error')),
  message text check (char_length(message) <= 1000),
  customer_id uuid references public.customers(id) on delete set null,
  enquiry_id uuid references public.enquiries(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists inbound_deliveries_lookup_idx on public.inbound_deliveries (connection_id, external_id, received_at desc);
create index if not exists inbound_deliveries_org_idx on public.inbound_deliveries (organisation_id, received_at desc);

alter table public.inbound_connections enable row level security;
alter table public.inbound_deliveries enable row level security;
drop policy if exists inbound_connections_read on public.inbound_connections;
create policy inbound_connections_read on public.inbound_connections for select to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
drop policy if exists inbound_connections_write on public.inbound_connections;
create policy inbound_connections_write on public.inbound_connections for all to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
drop policy if exists inbound_deliveries_read on public.inbound_deliveries;
create policy inbound_deliveries_read on public.inbound_deliveries for select to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));

-- ---------------------------------------------------------------------------------------------------------------
-- The key check (service role only): hash in, connection out.
create or replace function public.intake_connection(p_key_hash text)
returns table (connection_id uuid, organisation_id uuid, org_name text, provider text)
language sql stable security definer set search_path = public as $$
  select c.id, c.organisation_id, o.name, c.provider
  from public.inbound_connections c join public.organisations o on o.id = c.organisation_id
  where c.key_hash = p_key_hash and c.active and c.revoked_at is null and o.status = 'active';
$$;

/*
 * p_payload (already validated and normalised by the API route):
 * { external_id, external_version, stage: 'submitted'|'accepted', source_label,
 *   customer: { name, email, phone, company },
 *   event: { name, type, date, start_time, end_time, guests, venue, address },
 *   items: [{ section, name, description, quantity, unit, unit_price, tax_rate }],   -- unit_price ex GST
 *   totals: { subtotal, gst, total }, notes, valid_until, portal_url, accepted_by }
 */
create or replace function public.intake_external_quote(p_connection_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.inbound_connections%rowtype;
  o public.organisations%rowtype;
  prev public.inbound_deliveries%rowtype;
  v_ext text := left(nullif(trim(p_payload->>'external_id'), ''), 200);
  v_ver int := coalesce(public.try_int(p_payload->>'external_version'), 1);
  v_stage text := case when p_payload->>'stage' = 'accepted' then 'accepted' else 'submitted' end;
  v_src text := coalesce(nullif(trim(p_payload->>'source_label'), ''), 'LeadPages');
  cu jsonb := coalesce(p_payload->'customer', '{}'::jsonb);
  ev jsonb := coalesce(p_payload->'event', '{}'::jsonb);
  v_email text := lower(nullif(trim(cu->>'email'), ''));
  v_name text := left(nullif(trim(cu->>'name'), ''), 200);
  v_date date;
  v_today date;
  v_enquiry uuid; v_enq_no int;
  v_event uuid; v_event_no int;
  v_customer uuid;
  v_quote uuid; v_quote_no int; v_quote_status public.quote_status; v_published boolean;
  v_section uuid;
  v_outcome text;
  v_msg text;
  v_total numeric; v_expected numeric;
  v_title text;
  it jsonb; sec text; secs text[]; i int;
begin
  select * into c from public.inbound_connections where id = p_connection_id and active and revoked_at is null;
  if not found then raise exception 'This connection has been switched off'; end if;
  select * into o from public.organisations where id = c.organisation_id;
  if v_ext is null then raise exception 'external_id is required'; end if;
  if v_name is null and v_email is null then raise exception 'The customer needs a name or an email'; end if;
  update public.inbound_connections set last_used_at = now() where id = c.id;

  v_today := public.org_today(o.id);
  begin v_date := nullif(ev->>'date', '')::date; exception when others then v_date := null; end;
  v_title := left(coalesce(nullif(trim(ev->>'name'), ''),
                  nullif(trim(ev->>'type'), '') || coalesce(' — ' || v_name, ''),
                  'Online quote' || coalesce(' — ' || v_name, '')), 200);

  -- Have we seen this quote before? (latest delivery that produced a quote)
  select * into prev from public.inbound_deliveries
  where connection_id = c.id and external_id = v_ext and quote_id is not null
  order by received_at desc limit 1;

  if prev.id is not null then
    select q.id, q.number, q.status, q.current_version_id is not null into v_quote, v_quote_no, v_quote_status, v_published
    from public.quotes q where q.id = prev.quote_id;
    v_event := prev.event_id; v_enquiry := prev.enquiry_id; v_customer := prev.customer_id;
  end if;

  if prev.id is not null and v_quote is not null and v_stage = 'submitted' then
    if v_ver <= prev.external_version then
      v_outcome := 'duplicate';
      v_msg := 'Already received';
    elsif v_published or v_quote_status <> 'draft' then
      v_outcome := 'review';
      v_msg := 'The customer changed their online quote (version ' || v_ver || '), but Q-' || v_quote_no || ' has already been sent — review it by hand.';
      insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
      values (o.id, 'quote.intake_changed', 'Online quote changed: Q-' || v_quote_no, v_msg, '/quotes/' || v_quote, 'quote', v_quote);
    else
      -- Still a draft: replace the lines with the customer's latest choices
      delete from public.quote_items where quote_id = v_quote;
      delete from public.quote_sections where quote_id = v_quote;
      v_outcome := 'updated';
      v_msg := 'Draft Q-' || v_quote_no || ' updated to the customer''s latest online quote (version ' || v_ver || ')';
    end if;
  end if;

  -- Brand-new quote: customer + enquiry + event + draft quote
  if v_quote is null then
    insert into public.enquiries (organisation_id, title, contact_name, contact_email, contact_phone, company,
                                  event_type, event_date, guest_count, venue, message, source, status, classification,
                                  classification_confidence, received_at, next_action, next_action_due)
    values (o.id, v_title, v_name, v_email, left(nullif(trim(cu->>'phone'), ''), 40), left(nullif(trim(cu->>'company'), ''), 200),
            left(nullif(trim(ev->>'type'), ''), 80), v_date, public.try_int(ev->>'guests'),
            left(coalesce(nullif(trim(ev->>'venue'), ''), nullif(trim(ev->>'address'), '')), 200),
            left(nullif(trim(p_payload->>'notes'), ''), 5000), 'website', 'quote_required', 'event_enquiry', 0.99, now(),
            'Review the online quote and send it', now() + interval '4 hours')
    returning id, number into v_enquiry, v_enq_no;

    v_event := public.convert_enquiry_to_event(v_enquiry, v_title);
    select e.customer_id, e.number into v_customer, v_event_no from public.events e where e.id = v_event;
    update public.events set
      start_time = coalesce(public.try_time(ev->>'start_time'), start_time),
      finish_time = coalesce(public.try_time(ev->>'end_time'), finish_time),
      address = coalesce(left(nullif(trim(ev->>'address'), ''), 500), address),
      next_action = 'Review the online quote and send it', next_action_due = now()
    where id = v_event;

    insert into public.quotes (organisation_id, event_id, customer_id, title, status, issue_date, expiry_date, notes)
    values (o.id, v_event, v_customer, v_title, 'draft', v_today,
            greatest(v_today, coalesce(public.try_date(p_payload->>'valid_until'), v_today + 14)),
            left(nullif(trim(p_payload->>'notes'), ''), 20000))
    returning id, number into v_quote, v_quote_no;
    v_outcome := 'created';
    v_msg := 'Created ENQ-' || v_enq_no || ', EV-' || v_event_no || ' and draft Q-' || v_quote_no;
  end if;

  -- Lines (for a new quote, or a draft being refreshed)
  if v_outcome in ('created', 'updated') then
    select array_agg(distinct coalesce(nullif(trim(x->>'section'), ''), 'Online quote')) into secs
    from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) x;
    if secs is null then secs := array['Online quote']; end if;
    i := 0;
    foreach sec in array secs loop
      insert into public.quote_sections (organisation_id, quote_id, title, position)
      values (o.id, v_quote, left(sec, 200), i) returning id into v_section;
      insert into public.quote_items (organisation_id, quote_id, section_id, name, description, quantity, unit, unit_price, tax_rate, position)
      select o.id, v_quote, v_section, left(coalesce(nullif(trim(x->>'name'), ''), 'Item'), 200), left(nullif(trim(x->>'description'), ''), 4000),
             coalesce(public.try_numeric(x->>'quantity'), 1), left(nullif(trim(x->>'unit'), ''), 40),
             coalesce(public.try_numeric(x->>'unit_price'), 0), coalesce(public.try_numeric(x->>'tax_rate'), 10), (n - 1)::int
      from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) with ordinality as t(x, n)
      where coalesce(nullif(trim(x->>'section'), ''), 'Online quote') = sec;
      i := i + 1;
    end loop;

    -- Do our totals agree with theirs?
    v_total := (public.build_quote_snapshot(v_quote)->>'total')::numeric;
    v_expected := public.try_numeric(p_payload->'totals'->>'total');
    if v_expected is not null and abs(v_total - v_expected) > 0.05 then
      v_msg := v_msg || '. Totals differ: ' || v_src || ' said ' || to_char(v_expected, 'FM$999,999,990.00') || ', EventureOS makes it ' || to_char(v_total, 'FM$999,999,990.00') || ' — check the prices.';
    end if;

    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary)
    values (o.id, 'integration', v_src, case when v_outcome = 'created' then 'quote.intake_created' else 'quote.intake_updated' end,
            'quote', v_quote, v_customer, v_event, v_enquiry,
            case when v_outcome = 'created'
              then 'Online quote from ' || coalesce(v_name, v_email) || ' via ' || v_src || ' — draft Q-' || v_quote_no || ' (' || to_char(v_total, 'FM$999,999,990.00') || ')'
              else v_msg end);
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (o.id, 'quote.intake', case when v_outcome = 'created' then 'New online quote: ' || coalesce(v_name, v_email) else 'Online quote updated: Q-' || v_quote_no end,
            coalesce(v_title, '') || ' · ' || to_char(v_total, 'FM$999,999,990.00') || ' — review and send', '/quotes/' || v_quote, 'quote', v_quote);
  end if;

  -- Accepted on the website: tell the team (booking rules and deposits stay with EventureOS)
  if v_stage = 'accepted' then
    v_outcome := case when v_outcome = 'created' then 'created' else 'accepted' end;
    v_msg := coalesce(v_msg || '. ', '') || coalesce(nullif(trim(p_payload->>'accepted_by'), ''), v_name, 'The customer') || ' accepted the quote on ' || v_src || '.';
    update public.events set next_action = 'Customer accepted online — record the acceptance on Q-' || v_quote_no, next_action_due = now()
    where id = v_event;
    insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary)
    values (o.id, 'integration', v_src, 'quote.intake_accepted', 'quote', v_quote, v_customer, v_event, v_enquiry,
            coalesce(nullif(trim(p_payload->>'accepted_by'), ''), v_name, 'Customer') || ' accepted their online quote on ' || v_src);
    insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
    values (o.id, 'quote.intake_accepted', 'Accepted online: Q-' || v_quote_no,
            coalesce(v_name, v_email, 'The customer') || ' accepted on ' || v_src || '. Check Q-' || v_quote_no || ' matches, then record the acceptance to confirm the booking.',
            '/quotes/' || v_quote, 'quote', v_quote);
  end if;

  insert into public.inbound_deliveries (organisation_id, connection_id, external_id, external_version, stage, outcome, message,
                                         customer_id, enquiry_id, event_id, quote_id, payload)
  values (o.id, c.id, v_ext, v_ver, v_stage, v_outcome, left(v_msg, 1000), v_customer, v_enquiry, v_event, v_quote, p_payload);

  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'message', v_msg,
    'quote_id', v_quote, 'quote_number', 'Q-' || v_quote_no, 'event_id', v_event, 'customer_id', v_customer, 'enquiry_id', v_enquiry);
end $$;

-- Record a failed delivery so it shows in Settings (service role only)
create or replace function public.intake_record_error(p_connection_id uuid, p_external_id text, p_message text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.inbound_deliveries (organisation_id, connection_id, external_id, outcome, message, payload)
  select c.organisation_id, c.id, left(coalesce(nullif(p_external_id, ''), 'unknown'), 200), 'error', left(p_message, 1000), coalesce(p_payload, '{}'::jsonb)
  from public.inbound_connections c where c.id = p_connection_id;
end $$;

revoke all on function public.intake_connection(text) from public, anon, authenticated;
revoke all on function public.intake_external_quote(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.intake_record_error(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.intake_connection(text) to service_role;
grant execute on function public.intake_external_quote(uuid, jsonb) to service_role;
grant execute on function public.intake_record_error(uuid, text, text, jsonb) to service_role;
