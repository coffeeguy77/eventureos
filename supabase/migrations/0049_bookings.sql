-- =====================================================================
-- EventureOS 0049 — Bookings (courses & classes people book and pay for online)
--   booking_courses   : what can be booked (e.g. Home Barista Course 2hr $150) — price, seats, calendar, Xero codes
--   booking_sessions  : dated sessions of a course, with capacity and seats sold elsewhere (e.g. ClassBento)
--   booking_students  : everyone who has booked — one row per person (kept apart from event clients)
--   bookings          : a booking of 1+ seats on a session — paid by card, gift certificate, agency PO, or office
--   booking_agencies  : employment agencies that book with a code + purchase order → a draft invoice to check
--   booking_gifts     : gift certificates (dollar value, optional course), with a balance
--   booking_reserve() : takes seats atomically (row lock) so two people can never get the last seat
--   booking_release_expired() : frees seats (and gift balance) held by checkouts that were never paid
-- Also: inbound keys can be for the WordPress plugin (provider 'wordpress').
-- Nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------- courses
create table if not exists public.booking_courses (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations(id) on delete cascade,
  slug                   text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  name                   text not null check (char_length(name) between 1 and 120),
  summary                text check (char_length(summary) <= 300),
  description            text check (char_length(description) <= 8000),
  duration_minutes       integer not null default 120 check (duration_minutes between 15 and 1440),
  price                  numeric(10,2) not null default 0 check (price >= 0),
  capacity               integer not null default 6 check (capacity between 1 and 500),
  location               text check (char_length(location) <= 300),
  what_to_bring          text check (char_length(what_to_bring) <= 1000),
  image_url              text check (image_url is null or image_url ~ '^https://'),
  colour                 text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  calendar_connection_id uuid references public.calendar_connections(id) on delete set null,
  active                 boolean not null default true,
  public                 boolean not null default true,
  position               integer not null default 0,
  max_seats_per_booking  integer not null default 6 check (max_seats_per_booking between 1 and 100),
  waitlist               boolean not null default true,
  gift_enabled           boolean not null default true,
  agency_price           numeric(10,2) check (agency_price is null or agency_price >= 0),
  xero_item_code         text check (char_length(xero_item_code) <= 30),
  xero_account_code      text check (char_length(xero_account_code) <= 30),
  invoice_title          text check (char_length(invoice_title) <= 300),
  questions              jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  external_names         text[] not null default '{}',
  created_by             uuid references public.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (organisation_id, slug),
  unique (id, organisation_id)
);

-- ---------------------------------------------------------------- sessions
create table if not exists public.booking_sessions (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  course_id          uuid not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  capacity           integer not null check (capacity between 0 and 500),
  price              numeric(10,2) check (price is null or price >= 0),
  status             text not null default 'open' check (status in ('open','closed','cancelled')),
  external_seats     integer not null default 0 check (external_seats between 0 and 500),
  external_note      text check (char_length(external_note) <= 500),
  note               text check (char_length(note) <= 1000),
  calendar_event_id  uuid references public.calendar_events(id) on delete set null,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (course_id, starts_at),
  unique (id, organisation_id),
  foreign key (course_id, organisation_id) references public.booking_courses(id, organisation_id) on delete cascade
);
create index if not exists booking_sessions_when_idx on public.booking_sessions (organisation_id, starts_at);

-- ---------------------------------------------------------------- students
create table if not exists public.booking_students (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  email            text check (char_length(email) <= 254),
  phone            text check (char_length(phone) <= 40),
  marketing_ok     boolean not null default false,
  notes            text check (char_length(notes) <= 2000),
  source           text check (char_length(source) <= 40),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists booking_students_email_uq on public.booking_students (organisation_id, lower(email)) where email is not null;

-- ---------------------------------------------------------------- agencies
create table if not exists public.booking_agencies (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  customer_id      uuid references public.customers(id) on delete set null,
  price            numeric(10,2) check (price is null or price >= 0),
  contact_label    text not null default 'Contact' check (char_length(contact_label) <= 60),
  po_label         text not null default 'Purchase Order :' check (char_length(po_label) <= 60),
  site_label       text not null default 'Purchasing Site' check (char_length(site_label) <= 60),
  po_required      boolean not null default true,
  notify_email     text check (char_length(notify_email) <= 254),
  active           boolean not null default true,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, organisation_id)
);

-- ---------------------------------------------------------------- gift certificates
create table if not exists public.booking_gifts (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  code                  text not null check (code ~ '^[A-Z0-9-]{6,24}$'),
  course_id             uuid references public.booking_courses(id) on delete set null,
  amount                numeric(10,2) not null check (amount > 0),
  balance               numeric(10,2) not null check (balance >= 0),
  status                text not null default 'pending' check (status in ('pending','active','redeemed','void')),
  purchaser_name        text check (char_length(purchaser_name) <= 160),
  purchaser_email       text check (char_length(purchaser_email) <= 254),
  recipient_name        text check (char_length(recipient_name) <= 160),
  recipient_email       text check (char_length(recipient_email) <= 254),
  message               text check (char_length(message) <= 1000),
  send_on               date,
  sent_at               timestamptz,
  expires_on            date,
  source                text not null default 'stripe' check (source in ('stripe','office','import')),
  stripe_session_id     text,
  stripe_payment_intent text,
  view_token            text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (balance <= amount),
  unique (organisation_id, code),
  unique (view_token),
  unique (id, organisation_id)
);

-- ---------------------------------------------------------------- bookings
create table if not exists public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations(id) on delete cascade,
  reference             text not null,
  session_id            uuid not null,
  course_id             uuid not null,
  student_id            uuid,
  status                text not null default 'held' check (status in ('held','confirmed','waitlist','cancelled','attended','no_show')),
  seats                 integer not null default 1 check (seats between 1 and 100),
  attendees             jsonb not null default '[]'::jsonb check (jsonb_typeof(attendees) = 'array'),
  contact_name          text not null check (char_length(contact_name) between 1 and 160),
  contact_email         text check (char_length(contact_email) <= 254),
  contact_phone         text check (char_length(contact_phone) <= 40),
  answers               jsonb not null default '{}'::jsonb,
  notes                 text check (char_length(notes) <= 2000),
  price_each            numeric(10,2) not null default 0 check (price_each >= 0),
  total                 numeric(10,2) not null default 0 check (total >= 0),
  gift_amount           numeric(10,2) not null default 0 check (gift_amount >= 0),
  amount_paid           numeric(10,2) not null default 0 check (amount_paid >= 0),
  payment_method        text not null default 'stripe' check (payment_method in ('stripe','gift','agency','office','free','external')),
  source                text not null default 'website' check (source in ('website','wordpress','office','bookly','classbento','woocommerce','import')),
  agency_id             uuid references public.booking_agencies(id) on delete set null,
  po_number             text check (char_length(po_number) <= 60),
  po_site               text check (char_length(po_site) <= 160),
  po_contact            text check (char_length(po_contact) <= 160),
  invoice_id            uuid references public.invoices(id) on delete set null,
  gift_id               uuid references public.booking_gifts(id) on delete set null,
  stripe_session_id     text,
  stripe_payment_intent text,
  manage_token          text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  hold_expires_at       timestamptz,
  confirmed_at          timestamptz,
  checked_in_at         timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text check (char_length(cancel_reason) <= 500),
  external_ref          text check (char_length(external_ref) <= 120),
  utm                   jsonb not null default '{}'::jsonb,
  reminder_sent_at      timestamptz,
  followup_sent_at      timestamptz,
  confirmation_sent_at  timestamptz,
  created_by            uuid references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organisation_id, reference),
  unique (manage_token),
  unique (organisation_id, external_ref),
  foreign key (session_id, organisation_id) references public.booking_sessions(id, organisation_id) on delete restrict,
  foreign key (course_id, organisation_id) references public.booking_courses(id, organisation_id) on delete restrict,
  foreign key (student_id, organisation_id) references public.booking_students(id, organisation_id) on delete set null (student_id)
);
create index if not exists bookings_session_idx on public.bookings (session_id, status);
create index if not exists bookings_student_idx on public.bookings (student_id);
create index if not exists bookings_hold_idx on public.bookings (hold_expires_at) where status = 'held';
create index if not exists bookings_stripe_idx on public.bookings (stripe_session_id) where stripe_session_id is not null;

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['booking_courses','booking_sessions','booking_students','booking_agencies','booking_gifts','bookings'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS: the office team reads and manages; the public only via the server
do $$
declare t text;
begin
  foreach t in array array['booking_courses','booking_sessions','booking_students','booking_agencies','booking_gifts','bookings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_staff(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- seats
-- Seats taken on a session: confirmed / attended / no-show, unexpired holds, plus seats sold on other platforms.
create or replace function public.booking_seats_taken(p_session uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(b.seats) from public.bookings b
                   where b.session_id = p_session
                     and (b.status in ('confirmed','attended','no_show') or (b.status = 'held' and b.hold_expires_at > now()))), 0)::integer
       + coalesce((select s.external_seats from public.booking_sessions s where s.id = p_session), 0);
$$;
revoke all on function public.booking_seats_taken(uuid) from public, anon;
grant execute on function public.booking_seats_taken(uuid) to authenticated, service_role;

-- Free seats held by checkouts that were never finished; give back any gift balance they had taken.
create or replace function public.booking_release_expired(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id, gift_id, gift_amount from public.bookings
           where status = 'held' and hold_expires_at <= now() and (p_org is null or organisation_id = p_org)
           for update skip locked loop
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Checkout not finished in time', gift_amount = 0 where id = r.id;
    if r.gift_id is not null and r.gift_amount > 0 then
      update public.booking_gifts set balance = least(amount, balance + r.gift_amount),
        status = case when status = 'redeemed' then 'active' else status end where id = r.gift_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.booking_release_expired(uuid) from public, anon, authenticated;
grant execute on function public.booking_release_expired(uuid) to service_role;

-- Take seats. Locks the session row so the last seat can only go once.
--   p_hold_minutes > 0 → a 'held' booking that must be paid in time; 0 → confirmed straight away (gift / agency / office).
--   p_force → the office can overbook on purpose. p_waitlist → if it's full, join the waitlist instead of failing.
--   p_gift_code → takes up to the booking total off that gift certificate's balance (locked too).
-- Returns the booking id. Called by the server only (service role).
create or replace function public.booking_reserve(
  p_org uuid, p_session uuid, p_seats integer, p_booking jsonb,
  p_hold_minutes integer default 30, p_force boolean default false, p_waitlist boolean default false, p_gift_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.booking_sessions%rowtype; c public.booking_courses%rowtype; g public.booking_gifts%rowtype;
        v_taken integer; v_status text; v_id uuid; v_ref text; v_each numeric(10,2); v_total numeric(10,2); v_gift numeric(10,2) := 0;
begin
  if p_seats is null or p_seats < 1 then raise exception 'Choose at least one seat'; end if;
  perform public.booking_release_expired(p_org);
  select * into s from public.booking_sessions where id = p_session and organisation_id = p_org for update;
  if not found then raise exception 'That session no longer exists'; end if;
  select * into c from public.booking_courses where id = s.course_id;
  if not p_force then
    if s.status <> 'open' then raise exception 'Bookings for this session are closed'; end if;
    if s.starts_at <= now() then raise exception 'This session has already started'; end if;
    if p_seats > c.max_seats_per_booking then raise exception 'You can book up to % seats at once', c.max_seats_per_booking; end if;
  end if;
  v_taken := public.booking_seats_taken(s.id);
  if not p_force and v_taken + p_seats > s.capacity then
    if p_waitlist and c.waitlist then v_status := 'waitlist';
    elsif s.capacity - v_taken <= 0 then raise exception 'Sorry — this session has just sold out';
    else raise exception 'Only % seat% left in this session', s.capacity - v_taken, case when s.capacity - v_taken = 1 then '' else 's' end;
    end if;
  end if;
  v_status := coalesce(v_status, case when coalesce(p_hold_minutes, 0) > 0 then 'held' else 'confirmed' end);

  v_each := coalesce(nullif(p_booking->>'price_each', '')::numeric, s.price, c.price);
  v_total := round(v_each * p_seats, 2);

  if nullif(trim(coalesce(p_gift_code, '')), '') is not null and v_status <> 'waitlist' then
    select * into g from public.booking_gifts where organisation_id = p_org and code = upper(trim(p_gift_code)) for update;
    if not found or g.status not in ('active') then raise exception 'That gift certificate code isn''t valid'; end if;
    if g.expires_on is not null and g.expires_on < (now() at time zone 'Australia/Sydney')::date then raise exception 'That gift certificate expired on %', to_char(g.expires_on, 'DD/MM/YYYY'); end if;
    if g.course_id is not null and g.course_id <> c.id then raise exception 'That gift certificate is for a different course'; end if;
    if g.balance <= 0 then raise exception 'That gift certificate has already been used'; end if;
    v_gift := least(g.balance, v_total);
    update public.booking_gifts set balance = balance - v_gift, status = case when balance - v_gift <= 0 then 'redeemed' else status end where id = g.id;
  end if;

  v_ref := 'BK-' || public.next_org_number(p_org, 'booking', 1001)::text;
  insert into public.bookings (organisation_id, reference, session_id, course_id, student_id, status, seats, attendees, contact_name, contact_email, contact_phone,
    answers, notes, price_each, total, gift_amount, amount_paid, payment_method, source, agency_id, po_number, po_site, po_contact, gift_id,
    hold_expires_at, confirmed_at, utm, created_by)
  values (p_org, v_ref, s.id, c.id, nullif(p_booking->>'student_id', '')::uuid, v_status, p_seats,
    coalesce(p_booking->'attendees', '[]'::jsonb), left(coalesce(nullif(trim(p_booking->>'contact_name'), ''), 'Guest'), 160),
    nullif(lower(trim(p_booking->>'contact_email')), ''), nullif(trim(p_booking->>'contact_phone'), ''),
    coalesce(p_booking->'answers', '{}'::jsonb), nullif(trim(p_booking->>'notes'), ''), v_each, v_total, v_gift,
    case when v_status = 'confirmed' then v_gift else 0 end,
    coalesce(nullif(p_booking->>'payment_method', ''), 'stripe'), coalesce(nullif(p_booking->>'source', ''), 'website'),
    nullif(p_booking->>'agency_id', '')::uuid, nullif(trim(p_booking->>'po_number'), ''), nullif(trim(p_booking->>'po_site'), ''), nullif(trim(p_booking->>'po_contact'), ''),
    case when v_gift > 0 then g.id end,
    case when v_status = 'held' then now() + make_interval(mins => p_hold_minutes) end,
    case when v_status = 'confirmed' then now() end,
    coalesce(p_booking->'utm', '{}'::jsonb), nullif(p_booking->>'created_by', '')::uuid)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.booking_reserve(uuid, uuid, integer, jsonb, integer, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.booking_reserve(uuid, uuid, integer, jsonb, integer, boolean, boolean, text) to service_role;

-- Move a booking to another session of the same course (customer reschedule or the office). Locks the new session.
create or replace function public.booking_move(p_org uuid, p_booking uuid, p_session uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; s public.booking_sessions%rowtype; v_taken integer;
begin
  select * into b from public.bookings where id = p_booking and organisation_id = p_org for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('confirmed','waitlist','held') then raise exception 'Only current bookings can be moved'; end if;
  if b.session_id = p_session then return; end if;
  select * into s from public.booking_sessions where id = p_session and organisation_id = p_org for update;
  if not found then raise exception 'That session no longer exists'; end if;
  if s.course_id <> b.course_id and not p_force then raise exception 'That session is for a different course'; end if;
  if not p_force then
    if s.status <> 'open' then raise exception 'Bookings for that session are closed'; end if;
    if s.starts_at <= now() then raise exception 'That session has already started'; end if;
    v_taken := public.booking_seats_taken(s.id);
    if v_taken + b.seats > s.capacity then raise exception 'Not enough seats left in that session (% left)', greatest(0, s.capacity - v_taken); end if;
  end if;
  update public.bookings set session_id = s.id, course_id = s.course_id,
    status = case when status = 'waitlist' then 'confirmed' else status end,
    confirmed_at = coalesce(confirmed_at, case when status = 'waitlist' then now() end),
    reminder_sent_at = null, followup_sent_at = null
  where id = b.id;
end $$;
revoke all on function public.booking_move(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.booking_move(uuid, uuid, uuid, boolean) to service_role;

-- Next gift certificate / booking numbers come from the same per-organisation counters as invoices.
-- (next_org_number is already service-role callable.)

-- ---------------------------------------------------------------- WordPress plugin keys
alter table public.inbound_connections drop constraint if exists inbound_connections_provider_check;
alter table public.inbound_connections add constraint inbound_connections_provider_check check (provider in ('leadpages','custom','wordpress'));

-- ---------------------------------------------------------------- tidy expired holds every 5 minutes (if pg_cron is on)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'eventureos-booking-holds';
    perform cron.schedule('eventureos-booking-holds', '*/5 * * * *', 'select public.booking_release_expired(null)');
  end if;
end $$;
