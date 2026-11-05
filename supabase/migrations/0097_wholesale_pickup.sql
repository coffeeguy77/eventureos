-- 0097 — Wholesale pickup
--
-- A wholesale customer can collect from us instead of having it delivered:
--   wholesale_customers.fulfilment  'delivery' (default) | 'pickup' | 'either' (they choose on each order)
--   wholesale_orders.fulfilment     'delivery' (default) | 'pickup'
-- Pickup orders have no freight and no minimum order. When collected, staff mark it (collected_at / collected_by).

alter table public.wholesale_customers add column if not exists fulfilment text not null default 'delivery';
alter table public.wholesale_customers drop constraint if exists wholesale_customers_fulfilment_check;
alter table public.wholesale_customers add constraint wholesale_customers_fulfilment_check check (fulfilment in ('delivery', 'pickup', 'either'));

alter table public.wholesale_orders add column if not exists fulfilment text not null default 'delivery';
alter table public.wholesale_orders drop constraint if exists wholesale_orders_fulfilment_check;
alter table public.wholesale_orders add constraint wholesale_orders_fulfilment_check check (fulfilment in ('delivery', 'pickup'));
alter table public.wholesale_orders add column if not exists collected_at timestamptz;
alter table public.wholesale_orders add column if not exists collected_by text check (char_length(collected_by) <= 120);
