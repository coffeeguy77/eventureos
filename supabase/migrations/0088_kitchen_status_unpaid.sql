-- =====================================================================
-- EventureOS 0088 — the kitchen ticks items off: Ready / Issue, who and when, with running notes (kept on the job)
--   kitchen_item_status : one row per job, day and item — ready or issue, who set it, when
--   kitchen_item_notes  : timestamped notes about an item (e.g. "Eggs haven't arrived — Jerry's gone to get more")
-- Staff use these through server code (service role); the office reads them on the job and the Kitchen page.
-- =====================================================================

create table if not exists public.kitchen_item_status (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  day             date not null,
  item            text not null check (char_length(item) between 1 and 200),
  status          text not null check (status in ('ready', 'issue')),
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  by_name         text,
  updated_at      timestamptz not null default now(),
  primary key (event_id, day, item)
);

create table if not exists public.kitchen_item_notes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id        uuid not null references public.events(id) on delete cascade,
  day             date not null,
  item            text not null check (char_length(item) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 2000),
  crew_member_id  uuid references public.crew_members(id) on delete set null,
  by_name         text,
  created_at      timestamptz not null default now()
);
create index if not exists kitchen_item_notes_event on public.kitchen_item_notes (event_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['kitchen_item_status', 'kitchen_item_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_write', t);
  end loop;
end $$;
