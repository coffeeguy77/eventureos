-- Business Sales stage 3–4: the information memorandum (report sections, incl. what was written in exit360),
-- the public listing page, and buyer access with an NDA. Run in Supabase → SQL editor. Safe to run more than once.

-- The listing's public page: eventureos.com.au/for-sale/<slug>
alter table public.sale_listings add column if not exists slug text;
alter table public.sale_listings add column if not exists is_public boolean not null default false;
alter table public.sale_listings add column if not exists nda_required boolean not null default true;
alter table public.sale_listings add column if not exists nda_text text;
alter table public.sale_listings add column if not exists report_images jsonb not null default '[]'::jsonb;
create unique index if not exists sale_listings_slug on public.sale_listings (lower(slug)) where slug is not null;

-- Report / information memorandum sections
create table if not exists public.sale_report_sections (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  listing_id       uuid not null references public.sale_listings(id) on delete cascade,
  key              text not null,
  title            text not null,
  subtitle         text,
  body             text,
  bullets          jsonb not null default '[]'::jsonb,
  table_data       jsonb,
  -- who sees it: public = anyone with the page; buyers = approved buyers who signed the NDA; hidden = only you
  visibility       text not null default 'buyers' check (visibility in ('public', 'buyers', 'hidden')),
  position         int not null default 0,
  source           text not null default 'eventureos',
  updated_at       timestamptz not null default now(),
  unique (listing_id, key)
);
create index if not exists sale_report_sections_listing on public.sale_report_sections (listing_id, position);

-- Buyers given access: each has a private link; the NDA is signed on that link before buyer-only sections open
create table if not exists public.sale_buyers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  listing_id       uuid not null references public.sale_listings(id) on delete cascade,
  name             text not null,
  email            text,
  phone            text,
  company          text,
  token            text not null unique,
  status           text not null default 'invited' check (status in ('invited', 'nda_signed', 'approved', 'revoked')),
  nda_signed_at    timestamptz,
  nda_signed_name  text,
  nda_ip           text,
  first_seen_at    timestamptz,
  last_seen_at     timestamptz,
  views            int not null default 0,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists sale_buyers_listing on public.sale_buyers (listing_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['sale_report_sections', 'sale_buyers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_manager(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_manager(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;
-- The public page and buyer links are read on the server with the service role (no anonymous access to these tables).

-- Tour panoramas, photos and sound clips (public files, 25 MB each): sale-media/<orgId>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-media', 'sale-media', true, 26214400, array['image/png','image/jpeg','image/webp','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/webm','audio/ogg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "sale-media: managers list" on storage.objects;
create policy "sale-media: managers list" on storage.objects for select to authenticated
  using (bucket_id = 'sale-media' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "sale-media: managers upload" on storage.objects;
create policy "sale-media: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sale-media' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "sale-media: managers delete" on storage.objects;
create policy "sale-media: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sale-media' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
