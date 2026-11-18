-- Business Sales stage 2: the listing a buyer sees, its 360° walkthrough (scenes, hotspots, sound clips) and the
-- equipment register — including what was built in exit360. Run in Supabase → SQL editor. Safe to run more than once.

-- The listing for one business or division that's for sale
create table if not exists public.sale_listings (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  unit_id          uuid references public.sale_units(id) on delete set null,
  source           text not null default 'eventureos',   -- 'exit360' when brought over
  source_id        text,                                  -- the exit360 listing id
  title            text not null,
  status           text not null default 'draft' check (status in ('draft', 'listed', 'under_offer', 'sold', 'withdrawn')),
  -- everything on the listing (asking price range, weekly revenue, rent, lease options, reason for sale, …)
  details          jsonb not null default '{}'::jsonb,
  photos           text[] not null default '{}',
  -- the walkthrough: [{ id, name, panoramaUrl, isStartScene, defaultYaw, panoramaStartYaw, groundPitch, autoPan, enabled,
  --                     audioUrl, audioName, pins: [{ id, type: navigation|audio, title, description, position {x,y},
  --                     targetSpaceId, targetYaw, heightMetres, audioUrl, audioName, requiresNDA, visibility }] }]
  tour             jsonb not null default '[]'::jsonb,
  tour_settings    jsonb not null default '{}'::jsonb,
  imported_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists sale_listings_source on public.sale_listings (organisation_id, source, source_id) where source_id is not null;
create index if not exists sale_listings_unit on public.sale_listings (unit_id);

-- What's included in the sale: each item's second-hand value (what it's priced on) and replacement cost
create table if not exists public.sale_equipment (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  listing_id        uuid not null references public.sale_listings(id) on delete cascade,
  source_id         text,
  name              text not null,
  category          text,
  division          text,
  brand             text,
  condition         text,
  secondhand_value  numeric(12,2) not null default 0,
  replacement_cost  numeric(12,2) not null default 0,
  included          boolean not null default true,
  position          int not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists sale_equipment_listing on public.sale_equipment (listing_id, position);

do $$
declare t text;
begin
  foreach t in array array['sale_listings', 'sale_equipment'] loop
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
