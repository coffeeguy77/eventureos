-- Customer pricing: special terms for repeat customers on chosen price-list items
-- (e.g. 10% off coffees, or $2.50 a coffee). Applied automatically to new quote lines for that customer.
create table if not exists public.customer_prices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id     uuid not null,
  service_id      uuid not null,
  kind            text not null check (kind in ('percent', 'price')),   -- % off, or their own unit price (ex GST)
  value           numeric(12,2) not null check (value >= 0 and (kind <> 'percent' or value <= 100)),
  note            text check (char_length(note) <= 120),               -- shown on the line, e.g. "Loyal customer price"
  created_by      uuid references public.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (customer_id, service_id),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id) on delete cascade,
  foreign key (service_id, organisation_id) references public.services(id, organisation_id) on delete cascade
);
create index if not exists customer_prices_customer_idx on public.customer_prices (customer_id);
drop trigger if exists customer_prices_updated_at on public.customer_prices;
create trigger customer_prices_updated_at before update on public.customer_prices for each row execute function public.set_updated_at();

alter table public.customer_prices enable row level security;
drop policy if exists customer_prices_select on public.customer_prices;
create policy customer_prices_select on public.customer_prices for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists customer_prices_write on public.customer_prices;
create policy customer_prices_write on public.customer_prices for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Apply the customer's terms to a new quote line (only when it's at the normal list price, so hand-made
-- prices and discounts are never overridden). Shows the saving: "% off" on the line, or the special price
-- with "usually $3.00" added to the description.
create or replace function public.apply_customer_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cp public.customer_prices%rowtype;
  list_price numeric;
  label text;
begin
  if new.service_id is null then return new; end if;
  select p.* into cp from public.customer_prices p join public.quotes q on q.customer_id = p.customer_id
  where q.id = new.quote_id and p.service_id = new.service_id and p.organisation_id = new.organisation_id;
  if not found then return new; end if;
  select s.unit_price into list_price from public.services s where s.id = new.service_id;
  label := coalesce(nullif(trim(cp.note), ''), 'Loyal customer price');
  if cp.kind = 'percent' then
    if coalesce(new.discount_percent, 0) = 0 and coalesce(new.discount_amount, 0) = 0 and cp.value > 0 then
      new.discount_percent := cp.value;
    end if;
  elsif cp.kind = 'price' then
    if list_price is not null and new.unit_price = list_price and cp.value < list_price then
      new.unit_price := cp.value;
      new.description := trim(both E'\n' from coalesce(new.description, '') || E'\n' || label || ' (usually ' || to_char(list_price, 'FM$999,999,990.00') || ')');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists quote_items_customer_price on public.quote_items;
create trigger quote_items_customer_price before insert on public.quote_items for each row execute function public.apply_customer_price();
