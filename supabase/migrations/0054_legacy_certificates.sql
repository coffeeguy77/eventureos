-- Certificates issued before EventureOS (Google Forms / Autocrat PDFs), kept as the original file,
-- plus short-lived keys for one-off data imports, and a count of trained students.

alter table public.booking_certificates add column if not exists legacy_ref text check (legacy_ref is null or char_length(legacy_ref) <= 120);
alter table public.booking_certificates add column if not exists file_path text check (file_path is null or char_length(file_path) <= 300);
create unique index if not exists booking_certificates_legacy_uq on public.booking_certificates (organisation_id, legacy_ref) where legacy_ref is not null;

-- Private bucket for original certificate files (served only through the certificate link)
insert into storage.buckets (id, name, public) values ('certificates', 'certificates', false) on conflict (id) do nothing;

-- One-off import keys (hash only). Used by the importer endpoints; nothing else reads them.
create table if not exists public.import_keys (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  purpose         text not null check (char_length(purpose) between 1 and 40),
  key_hash        text not null unique,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
alter table public.import_keys enable row level security;   -- no policies: service role only

-- People who have finished a class (a certificate on record), counted once each
create or replace function public.trained_students(p_org uuid) returns integer language sql stable as $$
  select count(distinct coalesce(c.student_id::text, lower(c.person_name)))::int
  from public.booking_certificates c where c.organisation_id = p_org and c.status = 'issued';
$$;
