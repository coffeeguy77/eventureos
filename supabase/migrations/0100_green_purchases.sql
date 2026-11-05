-- 0100 — Green coffee purchases
--
-- Every green coffee invoice from the importers (Project Origin, Cofinet, Cofi-Com / Volcafe, Origin Coffee Traders,
-- Coffee & Nut Trading …), read from the business's Gmail, one row per invoice and one per coffee line — so the
-- roastery can see how much of each origin it has bought since it opened, every coffee by country and region, and
-- what green coffee has cost per kilo year by year.
-- Staff-only (prices paid are never shown publicly; the public price graph is an index worked out on the server).

create table if not exists public.roastery_purchases (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  supplier         text not null check (char_length(supplier) between 1 and 120),
  invoice_number   text check (char_length(invoice_number) <= 60),
  invoice_date     date,
  currency         text not null default 'AUD',
  coffee_ex_gst    numeric(12,2),            -- the coffee lines added up
  freight_ex_gst   numeric(12,2) not null default 0,
  total_inc_gst    numeric(12,2),            -- as printed
  source           text not null default 'gmail' check (source in ('gmail', 'upload', 'manual')),
  gmail_message_id text,
  attachment_name  text,
  read_by          text,                     -- 'ai' or a layout reader
  warnings         text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create unique index if not exists roastery_purchases_invoice on public.roastery_purchases (organisation_id, supplier, invoice_number) where invoice_number is not null;
create index if not exists roastery_purchases_date on public.roastery_purchases (organisation_id, invoice_date);

create table if not exists public.roastery_purchase_lines (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  purchase_id      uuid not null references public.roastery_purchases(id) on delete cascade,
  line_no          integer not null default 1,
  description      text not null check (char_length(description) <= 400),   -- as printed
  supplier_code    text check (char_length(supplier_code) <= 60),           -- e.g. BRA-25-0097, P18192.003
  country          text check (char_length(country) <= 60),                 -- Brazil, Colombia, Papua New Guinea …
  region           text check (char_length(region) <= 120),                 -- Minas Gerais, Huila, Sidama …
  farm             text check (char_length(farm) <= 160),                   -- farm, estate, co-op or washing station
  variety          text check (char_length(variety) <= 160),
  process          text check (char_length(process) <= 60),                 -- Washed, Natural, Honey …
  grade            text check (char_length(grade) <= 120),                  -- NY 2/3 Scr 17/18, AA, G1 …
  crop_year        integer check (crop_year between 2000 and 2100),
  certifications   text[] not null default '{}',                            -- Organic, Fairtrade, Rainforest …
  decaf            boolean not null default false,
  blend            boolean not null default false,                          -- a mix of origins
  bags             numeric(10,2),
  bag_kg           numeric(8,2),
  kg               numeric(12,3),                                           -- total green kilos on the line
  price_per_kg     numeric(10,4),                                           -- ex GST
  amount_ex_gst    numeric(12,2),
  created_at       timestamptz not null default now()
);
create index if not exists roastery_purchase_lines_purchase on public.roastery_purchase_lines (purchase_id);
create index if not exists roastery_purchase_lines_country on public.roastery_purchase_lines (organisation_id, country);

-- Every email attachment looked at, so nothing is read twice (failed ones are tried again)
create table if not exists public.roastery_purchase_emails (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  gmail_message_id text not null,
  attachment_name  text not null,
  from_email       text,
  subject          text,
  received_at      timestamptz,
  status           text not null check (status in ('imported', 'duplicate', 'skipped', 'failed')),
  purchase_id      uuid references public.roastery_purchases(id) on delete set null,
  message          text,
  created_at       timestamptz not null default now(),
  unique (organisation_id, gmail_message_id, attachment_name)
);

alter table public.roastery_purchases enable row level security;
alter table public.roastery_purchase_lines enable row level security;
alter table public.roastery_purchase_emails enable row level security;
do $$
declare t text;
begin
  foreach t in array array['roastery_purchases', 'roastery_purchase_lines', 'roastery_purchase_emails'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;
