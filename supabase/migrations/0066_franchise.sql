-- 0066 — Franchise applications: enquiry → application link → application → review → approved / declined.
-- Rows are written by the public franchise page and application form (service role, in server actions) and
-- managed by owners, admins and managers in the back end (Franchise).

create table if not exists public.franchise_applications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'enquiry'
    check (status in ('enquiry', 'invited', 'applied', 'reviewing', 'approved', 'declined', 'withdrawn')),
  name text not null check (char_length(name) between 2 and 160),
  email text not null check (char_length(email) between 3 and 254),
  phone text,
  location text,
  model text check (model is null or model in ('cafe', 'kiosk', 'licence', 'unsure')),
  message text,
  -- the full application form (keys and answers as typed)
  answers jsonb not null default '{}'::jsonb,
  -- the private link the applicant uses to fill in the application
  token uuid not null default gen_random_uuid() unique,
  notes text,
  source text,
  invited_at timestamptz,
  applied_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists franchise_applications_org on public.franchise_applications (organisation_id, status, created_at desc);
create index if not exists franchise_applications_email on public.franchise_applications (organisation_id, lower(email));

alter table public.franchise_applications enable row level security;
drop policy if exists franchise_applications_select on public.franchise_applications;
create policy franchise_applications_select on public.franchise_applications for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists franchise_applications_update on public.franchise_applications;
create policy franchise_applications_update on public.franchise_applications for update to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists franchise_applications_insert on public.franchise_applications;
create policy franchise_applications_insert on public.franchise_applications for insert to authenticated with check (public.is_org_manager(organisation_id));
drop policy if exists franchise_applications_delete on public.franchise_applications;
create policy franchise_applications_delete on public.franchise_applications for delete to authenticated using (public.is_org_manager(organisation_id));
