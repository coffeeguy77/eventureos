-- 0082: Coffee machines — service/repair jobs and machine sale enquiries (S-#### numbers).
-- Labour is priced from settings.machines (first hour incl. callout, then hourly); parts and machines come from the
-- price list (services) or one-off lines kept on the job. Online enquiries land here with source = 'online'.

create table if not exists public.machine_jobs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  number           text,
  kind             text not null default 'repair' check (kind in ('repair','service','install','sale')),
  status           text not null default 'new' check (status in ('new','booked','in_progress','waiting_parts','done','cancelled')),
  customer_id      uuid,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  company          text,
  site_address     text,                                   -- where the machine is (callouts)
  brand            text,
  model            text,
  serial           text,
  issue            text,                                   -- what's wrong / what they want
  preferred        text,                                   -- when suits them (free text from the form)
  booked_for       timestamptz,
  callout          boolean not null default true,          -- labour: first hour at the callout rate
  hours            numeric(6,2) not null default 0,        -- time on the job
  items            jsonb not null default '[]'::jsonb,      -- [{description, qty, unit_inc, tax_rate, service_id?, code?, account?}] GST inclusive
  price_inc_gst    numeric(12,2) not null default 0,
  invoice_id       uuid references public.invoices(id) on delete set null,
  source           text not null default 'manual' check (source in ('manual','online')),
  internal_notes   text,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);
create index if not exists machine_jobs_org on public.machine_jobs (organisation_id, created_at desc);
create index if not exists machine_jobs_customer on public.machine_jobs (customer_id) where customer_id is not null;

create or replace function public.machine_job_number() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := 'S-' || public.next_org_number(new.organisation_id, 'machine_job', 1001); end if;
  return new;
end $$;
revoke all on function public.machine_job_number() from public, anon, authenticated;
drop trigger if exists machine_jobs_number on public.machine_jobs;
create trigger machine_jobs_number before insert on public.machine_jobs for each row execute function public.machine_job_number();

alter table public.machine_jobs enable row level security;
drop policy if exists machine_jobs_staff on public.machine_jobs;
create policy machine_jobs_staff on public.machine_jobs for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
-- online enquiries are written by the server (service role) only; no anon access.
