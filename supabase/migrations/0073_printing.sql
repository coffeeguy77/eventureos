-- 0073 — Printing: print jobs (banners, signage, stickers…) quoted by the lineal metre, with the customer's artwork
-- files. Customers upload artwork from the events website (Printing page); files are private.

create table if not exists public.print_jobs (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  number           text,
  customer_id      uuid,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  company          text,
  title            text not null default 'Print job',
  details          text,                                   -- what the customer asked for
  status           text not null default 'new' check (status in ('new','quoted','approved','printing','ready','done','cancelled')),
  items            jsonb not null default '[]'::jsonb,      -- [{description, width_m, length_m, qty}]
  setup            boolean not null default true,
  cut              boolean not null default false,
  extras           jsonb not null default '[]'::jsonb,      -- [{description, amount}] ex GST
  price_ex_gst     numeric(12,2) not null default 0,
  gst              numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  needed_by        date,
  source           text not null default 'manual' check (source in ('manual','online')),
  upload_token     text not null default replace(gen_random_uuid()::text, '-', ''),
  invoice_id       uuid references public.invoices(id) on delete set null,
  quote_sent_at    timestamptz,
  internal_notes   text,
  created_by       uuid references public.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (customer_id, organisation_id) references public.customers(id, organisation_id)
);
create index if not exists print_jobs_org on public.print_jobs (organisation_id, created_at desc);

create or replace function public.print_job_number() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then new.number := 'P-' || public.next_org_number(new.organisation_id, 'print_job', 1001); end if;
  return new;
end $$;
revoke all on function public.print_job_number() from public, anon, authenticated;
drop trigger if exists print_jobs_number on public.print_jobs;
create trigger print_jobs_number before insert on public.print_jobs for each row execute function public.print_job_number();

create table if not exists public.print_files (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  job_id           uuid not null references public.print_jobs(id) on delete cascade,
  name             text not null,
  path             text not null,                          -- print-artwork bucket
  size             bigint,
  content_type     text,
  uploaded_by      text not null default 'staff' check (uploaded_by in ('staff','customer')),
  created_at       timestamptz not null default now()
);
create index if not exists print_files_job on public.print_files (job_id);

alter table public.print_jobs enable row level security;
alter table public.print_files enable row level security;
do $$ declare t text; begin
  foreach t in array array['print_jobs','print_files'] loop
    execute format('drop policy if exists %1$s_staff on public.%1$s', t);
    execute format('create policy %1$s_staff on public.%1$s for all to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t);
  end loop;
end $$;

-- artwork: private, up to 200 MB a file; customers upload through one-time signed links
insert into storage.buckets (id, name, public, file_size_limit)
values ('print-artwork', 'print-artwork', false, 209715200)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
drop policy if exists "print-artwork: managers read" on storage.objects;
create policy "print-artwork: managers read" on storage.objects for select to authenticated
  using (bucket_id = 'print-artwork' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "print-artwork: managers upload" on storage.objects;
create policy "print-artwork: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'print-artwork' and public.is_org_manager(public.try_uuid((storage.foldername(name))[1])));
