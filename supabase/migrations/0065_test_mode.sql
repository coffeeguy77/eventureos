-- 0065 Test mode
--
-- The test code (GIFTCARDTEST) lets the business try every checkout — class bookings, gift certificates, the coffee
-- shop and coffee gift cards — without paying. Everything it makes is marked is_test, so it:
--   • never takes a seat in a class (booking_seats_taken ignores it), and
--   • is hidden from the calendar, reports and lists, and
--   • is removed in one go by Settings → Testing → "Clear test results" (clear_test_data below).
-- The Academy "god user" (the owner's own login) uses a test student that is cleared the same way.
-- Safe to run more than once.

alter table public.bookings         add column if not exists is_test boolean not null default false;
alter table public.booking_gifts    add column if not exists is_test boolean not null default false;
alter table public.booking_students add column if not exists is_test boolean not null default false;
alter table public.shop_orders      add column if not exists is_test boolean not null default false;
alter table public.shop_gift_cards  add column if not exists is_test boolean not null default false;
alter table public.shop_customers   add column if not exists is_test boolean not null default false;

create index if not exists bookings_test_idx         on public.bookings (organisation_id) where is_test;
create index if not exists booking_gifts_test_idx    on public.booking_gifts (organisation_id) where is_test;
create index if not exists booking_students_test_idx on public.booking_students (organisation_id) where is_test;
create index if not exists shop_orders_test_idx      on public.shop_orders (organisation_id) where is_test;
create index if not exists shop_gift_cards_test_idx  on public.shop_gift_cards (organisation_id) where is_test;
create index if not exists shop_customers_test_idx   on public.shop_customers (organisation_id) where is_test;

-- Seats taken: test bookings never count
create or replace function public.booking_seats_taken(p_session uuid)
returns integer
language sql
stable security definer
set search_path to ''
as $function$
  select coalesce((select sum(b.seats) from public.bookings b
                   where b.session_id = p_session
                     and not b.is_test
                     and (b.status in ('confirmed','attended','no_show') or (b.status = 'held' and b.hold_expires_at > now()))), 0)::integer
       + coalesce((select s.external_seats from public.booking_sessions s where s.id = p_session), 0);
$function$;

-- Remove every test record for one business. Real customers and their real orders are never touched:
-- a student or shop customer is only removed when a test made them and nothing real points at them.
create or replace function public.clear_test_data(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_bookings int := 0; v_gifts int := 0; v_orders int := 0; v_cards int := 0; v_students int := 0; v_customers int := 0;
  v_ids uuid[];
begin
  if p_org is null then raise exception 'Choose a business'; end if;

  -- Everything test, by id, for the activity log and notifications
  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from public.bookings where organisation_id = p_org and is_test
    union all select id from public.booking_gifts where organisation_id = p_org and is_test
    union all select id from public.shop_orders where organisation_id = p_org and is_test
    union all select id from public.shop_gift_cards where organisation_id = p_org and is_test
  ) t;
  delete from public.activity_logs where organisation_id = p_org and entity_id = any(v_ids);
  delete from public.notifications where organisation_id = p_org and entity_id = any(v_ids);

  -- Class bookings (and their certificates)
  delete from public.booking_certificates where booking_id in (select id from public.bookings where organisation_id = p_org and is_test);
  update public.learn_access set booking_id = null where booking_id in (select id from public.bookings where organisation_id = p_org and is_test);
  delete from public.bookings where organisation_id = p_org and is_test;
  get diagnostics v_bookings = row_count;

  -- Gift certificates
  update public.bookings set gift_id = null where gift_id in (select id from public.booking_gifts where organisation_id = p_org and is_test);
  delete from public.booking_gifts where organisation_id = p_org and is_test;
  get diagnostics v_gifts = row_count;

  -- Coffee gift cards, then shop orders
  update public.shop_orders set gift_card_id = null
   where gift_card_id in (select id from public.shop_gift_cards where organisation_id = p_org and (is_test or order_id in (select id from public.shop_orders where organisation_id = p_org and is_test)));
  delete from public.shop_gift_cards where organisation_id = p_org and (is_test or order_id in (select id from public.shop_orders where organisation_id = p_org and is_test));
  get diagnostics v_cards = row_count;
  delete from public.shop_orders where organisation_id = p_org and is_test;
  get diagnostics v_orders = row_count;

  -- People a test made, with nothing real left
  delete from public.shop_customers c where c.organisation_id = p_org and c.is_test
    and not exists (select 1 from public.shop_orders o where o.customer_id = c.id);
  get diagnostics v_customers = row_count;
  delete from public.booking_students s where s.organisation_id = p_org and s.is_test
    and not exists (select 1 from public.bookings b where b.student_id = s.id)
    and not exists (select 1 from public.booking_certificates bc where bc.student_id = s.id)
    and not exists (select 1 from public.shop_customers sc where sc.student_id = s.id);
  get diagnostics v_students = row_count;

  return jsonb_build_object('bookings', v_bookings, 'gifts', v_gifts, 'orders', v_orders, 'giftCards', v_cards, 'students', v_students, 'customers', v_customers);
end $function$;

revoke all on function public.clear_test_data(uuid) from public, anon, authenticated;
grant execute on function public.clear_test_data(uuid) to service_role;
