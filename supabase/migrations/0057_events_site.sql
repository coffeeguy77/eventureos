-- =====================================================================
-- 0057_events_site.sql — public events section, website analytics, unfinished-checkout reminders, catering kitchen
--
-- 1. events.fleet / fleet_dates : which hire equipment a job takes out (e.g. {"cart":2}) and on which dates,
--    so the online quote builder can check availability (4 carts, 1 van, 2 DIY kits — set in settings.events.fleet).
--    events.catering             : catering deliveries for the job (morning / lunch / afternoon, items, times).
-- 2. site_quote_request(org, payload) : the website quote builder — customer + enquiry + event + DRAFT quote in one go.
-- 3. site_events : page views and clicks on the public site (sections, forms, products, carts) for the analytics page.
-- 4. site_carts  : unfinished checkouts / quotes with an email, for the "come back and finish" reminders (off by default).
-- 5. catering_ingredients + catering_recipe_lines : what goes into each catering item, per serve —
--    turns upcoming catering into a shopping list and a kitchen run sheet.
-- Adds tables, columns and functions only; nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

alter table public.events add column if not exists fleet       jsonb  not null default '{}'::jsonb;
alter table public.events add column if not exists fleet_dates date[] not null default '{}';
alter table public.events add column if not exists catering    jsonb  not null default '[]'::jsonb;
create index if not exists events_fleet_dates_idx on public.events using gin (fleet_dates);

-- ---------------------------------------------------------------- website quote builder
/*
 * p_payload (built and priced by the server, never the browser):
 * { title, event_type, date, start_time, end_time, guests, serves, staff, venue, address, notes, message,
 *   customer: { name, email, phone, company },
 *   fleet: {"cart":2}, fleet_dates: ["2026-11-14", …], catering: [...],
 *   sections: [{ title, items: [{ name, description, quantity, unit, unit_price, tax_rate, service_id, is_optional }] }],
 *   tentative: bool, source_label }
 */
create or replace function public.site_quote_request(p_org uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.organisations%rowtype;
  cu jsonb := coalesce(p_payload->'customer', '{}'::jsonb);
  v_email text := lower(nullif(trim(cu->>'email'), ''));
  v_name text := left(nullif(trim(cu->>'name'), ''), 200);
  v_title text := left(coalesce(nullif(trim(p_payload->>'title'), ''), 'Website quote'), 200);
  v_src text := coalesce(nullif(trim(p_payload->>'source_label'), ''), 'Website quote builder');
  v_date date; v_today date;
  v_enquiry uuid; v_enq_no int; v_event uuid; v_event_no int; v_customer uuid;
  v_quote uuid; v_quote_no int; v_section uuid; v_total numeric;
  s jsonb; i int := 0;
begin
  select * into o from public.organisations where id = p_org and status = 'active';
  if o.id is null then raise exception 'Business not found'; end if;
  if v_name is null or v_email is null then raise exception 'Your name and email are needed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right'; end if;
  -- Gentle flood protection: 30 website quotes per 10 minutes per business
  if (select count(*) from public.enquiries where organisation_id = o.id and source = 'website' and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many requests just now — please try again shortly';
  end if;
  v_today := public.org_today(o.id);
  begin v_date := nullif(p_payload->>'date', '')::date; exception when others then v_date := null; end;

  insert into public.enquiries (organisation_id, title, contact_name, contact_email, contact_phone, company,
                                event_type, event_date, guest_count, venue, message, source, status, classification,
                                classification_confidence, received_at, next_action, next_action_due)
  values (o.id, v_title, v_name, v_email, left(nullif(trim(cu->>'phone'), ''), 40), left(nullif(trim(cu->>'company'), ''), 200),
          left(nullif(trim(p_payload->>'event_type'), ''), 80), v_date, public.try_int(p_payload->>'guests'),
          left(coalesce(nullif(trim(p_payload->>'venue'), ''), nullif(trim(p_payload->>'address'), '')), 200),
          left(nullif(trim(p_payload->>'message'), ''), 5000), 'website', 'quote_required', 'event_enquiry', 0.99, now(),
          'Check the website quote and send it', now() + interval '2 hours')
  returning id, number into v_enquiry, v_enq_no;

  v_event := public.convert_enquiry_to_event(v_enquiry, v_title);
  select e.customer_id, e.number into v_customer, v_event_no from public.events e where e.id = v_event;
  update public.events set
    start_time = coalesce(public.try_time(p_payload->>'start_time'), start_time),
    finish_time = coalesce(public.try_time(p_payload->>'end_time'), finish_time),
    address = coalesce(left(nullif(trim(p_payload->>'address'), ''), 500), address),
    venue = coalesce(left(nullif(trim(p_payload->>'venue'), ''), 200), venue),
    guest_count = coalesce(public.try_int(p_payload->>'guests'), guest_count),
    serves = coalesce(public.try_int(p_payload->>'serves'), serves),
    crew_needed = coalesce(public.try_int(p_payload->>'staff'), crew_needed),
    customer_notes = coalesce(left(nullif(trim(p_payload->>'notes'), ''), 4000), customer_notes),
    fleet = coalesce(p_payload->'fleet', '{}'::jsonb),
    fleet_dates = coalesce((select array_agg(d::date) from jsonb_array_elements_text(coalesce(p_payload->'fleet_dates', '[]'::jsonb)) d), '{}'),
    catering = coalesce(p_payload->'catering', '[]'::jsonb),
    status = 'quoted',
    next_action = case when (p_payload->>'tentative')::boolean then 'Tentative (under 5 days away) — check staff, then send the quote' else 'Check the website quote and send it' end,
    next_action_due = now()
  where id = v_event;

  insert into public.quotes (organisation_id, event_id, customer_id, title, status, issue_date, expiry_date, notes)
  values (o.id, v_event, v_customer, v_title, 'draft', v_today, v_today + 14, left(nullif(trim(p_payload->>'notes'), ''), 20000))
  returning id, number into v_quote, v_quote_no;

  for s in select * from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) loop
    insert into public.quote_sections (organisation_id, quote_id, title, position)
    values (o.id, v_quote, left(coalesce(nullif(trim(s->>'title'), ''), 'Quote'), 200), i) returning id into v_section;
    insert into public.quote_items (organisation_id, quote_id, section_id, name, description, quantity, unit, unit_price, tax_rate, position, service_id, is_optional)
    select o.id, v_quote, v_section, left(coalesce(nullif(trim(x->>'name'), ''), 'Item'), 200), left(nullif(trim(x->>'description'), ''), 4000),
           coalesce(public.try_numeric(x->>'quantity'), 1), left(nullif(trim(x->>'unit'), ''), 40),
           coalesce(public.try_numeric(x->>'unit_price'), 0), coalesce(public.try_numeric(x->>'tax_rate'), 10), (n - 1)::int,
           (select sv.id from public.services sv where sv.id = public.try_uuid(x->>'service_id') and sv.organisation_id = o.id),
           coalesce((x->>'is_optional')::boolean, false)
    from jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) with ordinality as t(x, n);
    i := i + 1;
  end loop;

  v_total := (public.build_quote_snapshot(v_quote)->>'total')::numeric;
  insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, customer_id, event_id, enquiry_id, summary)
  values (o.id, 'customer', v_name, 'quote.website_request', 'quote', v_quote, v_customer, v_event, v_enquiry,
          v_name || ' built a quote on the website (' || v_src || ') — draft Q-' || v_quote_no || ' (' || to_char(v_total, 'FM$999,999,990.00') || ')'
          || case when (p_payload->>'tentative')::boolean then ' · tentative: under 5 days away' else '' end);
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (o.id, 'quote.website', 'Website quote: ' || v_name, v_title || ' · ' || to_char(v_total, 'FM$999,999,990.00') || ' — check and send', '/quotes/' || v_quote, 'quote', v_quote);

  return jsonb_build_object('ok', true, 'quote_id', v_quote, 'quote_number', 'Q-' || v_quote_no, 'event_id', v_event, 'event_number', 'EV-' || v_event_no,
    'enquiry_id', v_enquiry, 'customer_id', v_customer, 'total', v_total);
end $$;
revoke all on function public.site_quote_request(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.site_quote_request(uuid, jsonb) to service_role;

-- Equipment already out on given dates (confirmed, awaiting approval, quoted or planning jobs), by type.
create or replace function public.fleet_booked(p_org uuid, p_from date, p_to date)
returns table (day date, kind text, units int, firm int) language sql stable security definer set search_path = public as $$
  select d::date as day, f.key as kind,
         sum(greatest(0, public.try_int(f.value #>> '{}')))::int as units,
         sum(case when e.status in ('confirmed','awaiting_approval') then greatest(0, public.try_int(f.value #>> '{}')) else 0 end)::int as firm
  from public.events e
  cross join lateral jsonb_each(e.fleet) f
  cross join lateral unnest(case when cardinality(e.fleet_dates) > 0 then e.fleet_dates else array[e.event_date] end) d
  where e.organisation_id = p_org and e.status in ('planning','quoted','awaiting_approval','confirmed')
    and d between p_from and p_to
  group by 1, 2;
$$;
revoke all on function public.fleet_booked(uuid, date, date) from public, anon, authenticated;
grant execute on function public.fleet_booked(uuid, date, date) to service_role, authenticated;

-- ---------------------------------------------------------------- website analytics
create table if not exists public.site_events (
  id               bigserial primary key,
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  visitor          text not null check (char_length(visitor) between 6 and 40),    -- random id kept in the browser (no personal data)
  session          text not null check (char_length(session) between 6 and 40),
  kind             text not null check (kind in ('view','click','form_start','form_submit','cart_add','checkout_start','purchase','quote_start','quote_submit')),
  section          text check (char_length(section) <= 30),
  path             text check (char_length(path) <= 300),
  label            text check (char_length(label) <= 160),
  referrer         text check (char_length(referrer) <= 300),
  device           text check (device in ('mobile','tablet','desktop')),
  created_at       timestamptz not null default now()
);
create index if not exists site_events_org_time on public.site_events (organisation_id, created_at desc);
create index if not exists site_events_session on public.site_events (organisation_id, session, created_at);

-- ---------------------------------------------------------------- unfinished checkouts / quotes
create table if not exists public.site_carts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  section          text not null check (section in ('shop','classes','gifts','giftcards','events','catering')),
  email            text not null check (char_length(email) <= 254),
  name             text check (char_length(name) <= 160),
  summary          text check (char_length(summary) <= 300),     -- "Parliament 1kg, Night Owl 250g" / "Coffee van · Sat 14 Nov"
  total            numeric(10,2),
  resume_path      text check (char_length(resume_path) <= 500), -- where "finish it" takes them
  detail           jsonb not null default '{}'::jsonb,           -- e.g. {"date":"2026-11-14","kind":"van"} for the FOMO line
  status           text not null default 'open' check (status in ('open','done','stopped')),
  reminders_sent   integer not null default 0,
  last_reminded_at timestamptz,
  stop_token       text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, section, email)
);
create index if not exists site_carts_open on public.site_carts (organisation_id, status, updated_at);

-- ---------------------------------------------------------------- catering kitchen
create table if not exists public.catering_ingredients (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  unit             text not null default 'each' check (char_length(unit) <= 20),   -- each, g, kg, ml, L, slice, loaf…
  pack_size        numeric(12,3) check (pack_size is null or pack_size > 0),       -- buy in packs of this many units
  pack_label       text check (char_length(pack_label) <= 60),                     -- "1kg bag", "dozen"
  supplier         text check (char_length(supplier) <= 120),
  station          text check (char_length(station) <= 60),                        -- kitchen area: bakery, cold prep…
  notes            text check (char_length(notes) <= 500),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, name)
);
create table if not exists public.catering_recipe_lines (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  service_id       uuid not null references public.services(id) on delete cascade,              -- the menu item
  ingredient_id    uuid not null references public.catering_ingredients(id) on delete cascade,
  qty_per_serve    numeric(12,4) not null check (qty_per_serve > 0),
  prep_note        text check (char_length(prep_note) <= 200),
  created_at       timestamptz not null default now(),
  unique (service_id, ingredient_id)
);
create index if not exists catering_recipe_lines_service on public.catering_recipe_lines (organisation_id, service_id);

do $$
declare t text;
begin
  foreach t in array array['site_carts','catering_ingredients'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
  foreach t in array array['site_events','site_carts','catering_ingredients','catering_recipe_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
  end loop;
  -- The office edits recipes and ingredients; analytics and carts are written by the server only
  foreach t in array array['catering_ingredients','catering_recipe_lines','site_carts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_staff(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_staff(organisation_id))', t || '_delete', t);
  end loop;
end $$;
