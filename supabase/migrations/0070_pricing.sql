-- 0070 — Pricing: supplier invoices read from Gmail (or uploaded), one price row per invoice line, so price creep,
-- incorrect invoicing and the cheapest supplier for each product are easy to see. Owners, admins and managers only.

create table if not exists public.price_suppliers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null,
  match_from       text[] not null default '{}',     -- sender addresses or domains, e.g. accounts@supplier.com.au, @supplier.com.au
  match_subject    text,                              -- subject must contain (optional)
  match_exclude    text[] not null default '{}',     -- skip subjects containing, e.g. Statement
  parser           text not null default 'auto',      -- auto | bidfood | longpark | fresho | generic | ai
  active           boolean not null default true,
  last_synced_at   timestamptz,
  -- for ordering later: minimum order, free delivery threshold, delivery fee, the rep
  min_order        numeric(12,2),
  free_delivery_over numeric(12,2),
  delivery_fee     numeric(12,2),
  rep_name         text,
  rep_email        text,
  rep_phone        text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists price_suppliers_org on public.price_suppliers (organisation_id);

create table if not exists public.price_invoices (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  supplier_id      uuid not null references public.price_suppliers(id) on delete cascade,
  invoice_number   text,
  invoice_date     date,
  source           text not null default 'gmail' check (source in ('gmail','upload')),
  gmail_message_id text,
  attachment_name  text,
  storage_path     text,                              -- supplier-invoices bucket
  read_by          text,                              -- which reader understood it (parser name or 'ai')
  subtotal         numeric(12,2),
  total            numeric(12,2),
  line_count       integer not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);
create unique index if not exists price_invoices_number on public.price_invoices (organisation_id, supplier_id, invoice_number) where invoice_number is not null;
create index if not exists price_invoices_date on public.price_invoices (organisation_id, invoice_date);

create table if not exists public.price_lines (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  invoice_id       uuid not null references public.price_invoices(id) on delete cascade,
  supplier_id      uuid not null references public.price_suppliers(id) on delete cascade,
  line_no          integer not null,
  code             text,
  description      text not null,
  match_key        text not null,                     -- same product from the same supplier: code, else cleaned name
  invoice_date     date,
  qty              numeric(12,3),
  unit             text,
  pack_size        text,
  unit_price       numeric(12,4) not null,            -- ex GST, per invoice unit
  line_total       numeric(12,2),
  base_unit        text not null check (base_unit in ('kg','L','ea')),
  base_qty         numeric(12,4) not null,
  price_per_base   numeric(12,4) not null,            -- ex GST, per kg / L / each
  created_at       timestamptz not null default now()
);
create index if not exists price_lines_product on public.price_lines (organisation_id, supplier_id, match_key, invoice_date);
create index if not exists price_lines_search on public.price_lines using gin (to_tsvector('simple', description));

-- every Gmail attachment looked at, so nothing is imported twice
create table if not exists public.price_email_imports (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  supplier_id      uuid references public.price_suppliers(id) on delete set null,
  gmail_message_id text not null,
  attachment_name  text not null,
  subject          text,
  from_email       text,
  received_at      timestamptz,
  status           text not null check (status in ('imported','duplicate','skipped','failed')),
  invoice_id       uuid references public.price_invoices(id) on delete set null,
  message          text,
  created_at       timestamptz not null default now(),
  unique (organisation_id, gmail_message_id, attachment_name)
);

alter table public.price_suppliers enable row level security;
alter table public.price_invoices enable row level security;
alter table public.price_lines enable row level security;
alter table public.price_email_imports enable row level security;

do $$ declare t text; begin
  foreach t in array array['price_suppliers','price_invoices','price_lines','price_email_imports'] loop
    execute format('drop policy if exists %1$s_manager on public.%1$s', t);
    execute format('create policy %1$s_manager on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;

-- the invoice PDFs: private; managers can read their own business's folder (<organisation id>/…)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-invoices', 'supplier-invoices', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "supplier-invoices: managers read" on storage.objects;
create policy "supplier-invoices: managers read" on storage.objects for select to authenticated
  using (bucket_id = 'supplier-invoices' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "supplier-invoices: managers upload" on storage.objects;
create policy "supplier-invoices: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-invoices' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
