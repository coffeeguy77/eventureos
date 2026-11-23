-- 0118: Nerd Herd → Projects. Ongoing client work with an evolving bill: phases, links, open items, a time log
-- (AI-recorded time can carry a margin for the owner's planning, direction and testing), requests (support
-- tickets tagged to the project) and the project's invoices. Clients see their own projects in the portal; the
-- portal reads them server-side after checking who's signed in, so only staff policies are needed here.

create table if not exists public.nh_projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'on_hold', 'complete', 'archived')),
  status_note text,
  summary text,
  delivered_by text,
  started date,
  rate numeric(10,2) check (rate is null or rate >= 0),              -- per hour ex GST; null = the Nerd Herd rate
  margin_percent numeric(6,2) not null default 0 check (margin_percent between 0 and 500),
  margin_label text not null default 'Planning, direction and testing',
  phases jsonb not null default '[]'::jsonb,                          -- [{name, dates, status}]
  links jsonb not null default '[]'::jsonb,                           -- [{label, url}]
  open_items jsonb not null default '[]'::jsonb,                      -- [text]
  notes text,                                                         -- shown to the client (deliverables, findings)
  staff_notes text,                                                   -- staff only
  portal boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nh_projects_org on public.nh_projects (organisation_id, status);
create index if not exists nh_projects_customer on public.nh_projects (customer_id);

create table if not exists public.nh_project_time (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_id uuid not null references public.nh_projects(id) on delete cascade,
  work_date date not null,
  start_time text,
  end_time text,
  hours numeric(7,2) not null check (hours > 0 and hours <= 24),
  work text not null check (length(work) between 1 and 2000),
  kind text not null default 'staff' check (kind in ('ai', 'staff')),  -- ai: recorded from an AI session (the margin applies)
  source text,                                                         -- commits, activity log, timesheet…
  by_name text,
  billable boolean not null default true,
  billed_invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists nh_project_time_project on public.nh_project_time (project_id, work_date);

alter table public.support_tickets add column if not exists project_id uuid references public.nh_projects(id) on delete set null;
alter table public.invoices add column if not exists project_id uuid references public.nh_projects(id) on delete set null;
create index if not exists support_tickets_project on public.support_tickets (project_id) where project_id is not null;
create index if not exists invoices_project on public.invoices (project_id) where project_id is not null;

alter table public.nh_projects enable row level security;
alter table public.nh_project_time enable row level security;
drop policy if exists "nh_projects staff" on public.nh_projects;
create policy "nh_projects staff" on public.nh_projects for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
drop policy if exists "nh_project_time staff" on public.nh_project_time;
create policy "nh_project_time staff" on public.nh_project_time for all to authenticated
  using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));

notify pgrst, 'reload schema';
