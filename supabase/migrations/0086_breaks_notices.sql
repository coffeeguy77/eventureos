-- =====================================================================
-- EventureOS 0086 — break tracking on the café iPad, and a notice board for staff
--   staff_time_entries.break_taken  : minutes of break actually clocked on the iPad (null = no break clocked)
--   staff_time_entries.breaks       : each break clocked [{ start, end }] — for the office to see
--   staff_time_entries.break_locked : the office set this break by hand — leave it as is (smart breaks don't touch it)
--   staff_notices                   : news from the office, to everyone or chosen people (optionally "tap to confirm")
--   staff_notice_reads              : who has read / confirmed each notice (the red dot in the staff app)
-- Staff use these through server code (service role); the office reads and writes them.
-- =====================================================================

alter table public.staff_time_entries add column if not exists break_taken integer check (break_taken is null or break_taken between 0 and 1440);
alter table public.staff_time_entries add column if not exists breaks jsonb not null default '[]'::jsonb;
alter table public.staff_time_entries add column if not exists break_locked boolean not null default false;

create table if not exists public.staff_notices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  body            text check (body is null or char_length(body) <= 5000),
  member_ids      uuid[] not null default '{}',     -- empty = everyone
  needs_ok        boolean not null default false,   -- staff tap "Got it" to confirm
  pinned          boolean not null default false,
  expires_on      date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists staff_notices_org on public.staff_notices (organisation_id, created_at desc);

create table if not exists public.staff_notice_reads (
  notice_id       uuid not null references public.staff_notices(id) on delete cascade,
  crew_member_id  uuid not null references public.crew_members(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  read_at         timestamptz not null default now(),
  confirmed_at    timestamptz,
  primary key (notice_id, crew_member_id)
);
create index if not exists staff_notice_reads_member on public.staff_notice_reads (crew_member_id);

do $$
declare t text;
begin
  foreach t in array array['staff_notices', 'staff_notice_reads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_write', t);
  end loop;
end $$;
