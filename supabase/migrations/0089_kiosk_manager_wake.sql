-- =====================================================================
-- EventureOS 0089 — café iPad manager access, and wake-up texts before a shift
--   kiosk_manager_codes      : the code texted to a manager when they unlock Manager access on the café iPad
--   staff_shifts.wake_sent_at: the "your shift starts soon" text (set per person, minutes before) went out
-- =====================================================================

create table if not exists public.kiosk_manager_codes (
  crew_member_id  uuid primary key references public.crew_members(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code_hash       text not null,
  expires_at      timestamptz not null,
  attempts        integer not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.kiosk_manager_codes enable row level security; -- server only (no policies)

alter table public.staff_shifts add column if not exists wake_sent_at timestamptz;
