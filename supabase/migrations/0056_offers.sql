-- =====================================================================
-- 0056_offers.sql — one set of offer codes for the whole site
--
-- Coupons (shop_coupons) now work beyond the coffee shop: on barista classes and on gift certificates too.
--   works_on    : where the code can be used — 'shop', 'classes', 'gifts' (existing coupons stay shop-only)
--   course_ids  : classes / class gift certificates it's limited to (empty = all)
--   headline    : the offer's name for the website ribbon and the printable poster ("Spring special")
--   ribbon      : show the offer as a ribbon across the top of the website while it runs
-- Bookings and gift certificates remember the code used and the discount given.
-- Adds columns only; nothing existing is changed or removed. Safe to run more than once.
-- =====================================================================

alter table public.shop_coupons add column if not exists works_on   text[]  not null default '{shop}';
alter table public.shop_coupons add column if not exists course_ids uuid[]  not null default '{}';
alter table public.shop_coupons add column if not exists headline   text;
alter table public.shop_coupons add column if not exists ribbon     boolean not null default false;

alter table public.shop_coupons drop constraint if exists shop_coupons_works_on_check;
alter table public.shop_coupons add constraint shop_coupons_works_on_check
  check (works_on <@ array['shop','classes','gifts']::text[] and cardinality(works_on) >= 1);
alter table public.shop_coupons drop constraint if exists shop_coupons_headline_check;
alter table public.shop_coupons add constraint shop_coupons_headline_check check (headline is null or char_length(headline) <= 80);

alter table public.bookings add column if not exists coupon_id   uuid references public.shop_coupons(id) on delete set null;
alter table public.bookings add column if not exists coupon_code text;
alter table public.bookings add column if not exists discount    numeric(10,2) not null default 0;

alter table public.booking_gifts add column if not exists coupon_id   uuid references public.shop_coupons(id) on delete set null;
alter table public.booking_gifts add column if not exists coupon_code text;
alter table public.booking_gifts add column if not exists discount    numeric(10,2) not null default 0;

create index if not exists bookings_coupon_idx on public.bookings (coupon_id) where coupon_id is not null;
create index if not exists booking_gifts_coupon_idx on public.booking_gifts (coupon_id) where coupon_id is not null;

-- Count one use of a code (server only)
create or replace function public.offer_used(p_coupon uuid)
returns void language sql security definer set search_path = '' as $$
  update public.shop_coupons set uses = uses + 1 where id = p_coupon;
$$;
revoke all on function public.offer_used(uuid) from public, anon, authenticated;
grant execute on function public.offer_used(uuid) to service_role;
