-- =====================================================================
-- EventureOS 0050 — Course certificates and student sign-in
--   booking_certificate_templates : the certificate design for an organisation (one default per org)
--   booking_certificates          : certificates issued to people who did a course (one per person per booking)
--   booking_student_logins        : one-time sign-in links emailed to students (magic link, no passwords)
--   booking_student_sessions      : signed-in students (the browser keeps a random token; only its hash is stored)
-- Students never get a database login: the server checks these tables. Office staff can read and manage them.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.booking_certificate_templates (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  name             text not null default 'Certificate' check (char_length(name) between 1 and 80),
  design           jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object'),
  is_default       boolean not null default true,
  auto_issue       boolean not null default true,
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists booking_certificate_templates_default_uq on public.booking_certificate_templates (organisation_id) where is_default;

create table if not exists public.booking_certificates (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  number           text not null,
  booking_id       uuid references public.bookings(id) on delete set null,
  student_id       uuid references public.booking_students(id) on delete set null,
  course_id        uuid references public.booking_courses(id) on delete set null,
  person_name      text not null check (char_length(person_name) between 1 and 160),
  course_name      text not null check (char_length(course_name) between 1 and 160),
  completed_on     date not null,
  hours            numeric(5,2),
  attendee_index   integer not null default 0 check (attendee_index between 0 and 99),
  verify_token     text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  status           text not null default 'issued' check (status in ('issued','revoked')),
  issued_by        uuid references public.users(id),
  emailed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organisation_id, number),
  unique (verify_token)
);
create unique index if not exists booking_certificates_person_uq on public.booking_certificates (booking_id, attendee_index) where booking_id is not null;
create index if not exists booking_certificates_student_idx on public.booking_certificates (student_id);

create table if not exists public.booking_student_logins (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  student_id       uuid not null references public.booking_students(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists booking_student_logins_student_idx on public.booking_student_logins (student_id, created_at desc);

create table if not exists public.booking_student_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  student_id       uuid not null references public.booking_students(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Students can ask for a certificate when the old system no longer knows which course they did
alter table public.booking_students add column if not exists certificate_requested_at timestamptz;
alter table public.booking_students add column if not exists external_ref text check (char_length(external_ref) <= 120);
create unique index if not exists booking_students_external_uq on public.booking_students (organisation_id, external_ref) where external_ref is not null;

do $$
declare t text;
begin
  foreach t in array array['booking_certificate_templates','booking_certificates'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- RLS: office team reads and manages certificates; sign-in tables are server-only (no policies = no client access)
do $$
declare t text;
begin
  foreach t in array array['booking_certificate_templates','booking_certificates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_org_staff(organisation_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_org_manager(organisation_id))', t || '_delete', t);
  end loop;
end $$;
alter table public.booking_student_logins enable row level security;
alter table public.booking_student_sessions enable row level security;
