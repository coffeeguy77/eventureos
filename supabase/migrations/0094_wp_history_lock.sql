-- 0094 — Nerd Herd command ops, part 2.
--   1. Maintenance history can record site locks/unlocks and entries imported from the site's own log
--      (the Web Culture Connector keeps a log of every update, cache purge and lock, whoever ran it).
--      source = 'eventureos' | 'site'; external_key de-duplicates imported entries.
--   2. Clients see their websites' maintenance history in the portal (public = true entries only).
-- Additive only. Safe to run more than once.

alter table public.website_maintenance_runs drop constraint if exists website_maintenance_runs_action_check;
alter table public.website_maintenance_runs add constraint website_maintenance_runs_action_check
  check (action in ('connect','check','update','purge','disconnect','lock','unlock','other'));
alter table public.website_maintenance_runs add column if not exists source       text not null default 'eventureos';
alter table public.website_maintenance_runs add column if not exists external_key text;
alter table public.website_maintenance_runs add column if not exists public       boolean not null default true;
-- nulls are distinct, so EventureOS-made rows (no key) never clash
create unique index if not exists website_maintenance_runs_external on public.website_maintenance_runs (website_id, external_key);

drop policy if exists website_maintenance_runs_portal_select on public.website_maintenance_runs;
create policy website_maintenance_runs_portal_select on public.website_maintenance_runs for select to authenticated
  using (
    public
    and action in ('update','purge','lock','unlock')
    and exists (select 1 from public.websites w
                where w.id = website_maintenance_runs.website_id
                  and w.customer_id in (select public.portal_customer_ids())
                  and w.status <> 'archived')
  );

-- 3. Lock state on the connector row (copied from the site's status)
alter table public.website_connectors add column if not exists locked       boolean not null default false;
alter table public.website_connectors add column if not exists locked_since timestamptz;
