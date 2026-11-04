-- 0096 — Wholesale delivery proof
--
-- The driver ticks each wholesale order off in the staff app (Deliveries tab). Every tick — and every undo — is written
-- here with the time, who did it and where their phone was, so a "we never got it" can be answered.
-- Append-only: staff can read it; only the server (service role) writes; nobody can edit or delete rows.

create table if not exists public.wholesale_delivery_log (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  order_id         uuid not null references public.wholesale_orders(id) on delete cascade,
  action           text not null check (action in ('delivered', 'undone')),
  at               timestamptz not null default now(),
  crew_member_id   uuid references public.crew_members(id) on delete set null,
  by_name          text not null check (char_length(by_name) between 1 and 120),
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  accuracy_m       integer check (accuracy_m >= 0),
  geo_error        text check (char_length(geo_error) <= 200),      -- why there's no location (denied, timed out…)
  device_time      timestamptz,                                      -- the phone's clock, for comparison
  note             text check (char_length(note) <= 500),           -- e.g. "left at back door"
  user_agent       text check (char_length(user_agent) <= 300)
);

create index if not exists wholesale_delivery_log_order on public.wholesale_delivery_log (order_id, at desc);
create index if not exists wholesale_delivery_log_org on public.wholesale_delivery_log (organisation_id, at desc);

alter table public.wholesale_delivery_log enable row level security;
drop policy if exists wholesale_delivery_log_select on public.wholesale_delivery_log;
create policy wholesale_delivery_log_select on public.wholesale_delivery_log for select to authenticated using (public.is_org_staff(organisation_id));
-- no insert / update / delete policies: only the service role writes, and rows are never changed
revoke update, delete on public.wholesale_delivery_log from authenticated, anon;
