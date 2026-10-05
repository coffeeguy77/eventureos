-- =====================================================================
-- EventureOS 0051 — Barista job board (e.g. "Bean Culture Barista Jobs")
--   job_profiles            : a barista's profile (one per student). Contact details stay hidden unless they choose to share.
--   job_employers           : businesses looking for staff — the office approves them before they can search or post
--   job_employer_logins/sessions : employer sign-in by emailed link (no passwords)
--   job_posts               : jobs and shifts (one-off, event, regular, ongoing) — hidden once filled or closed
--   job_threads / job_messages : conversations between an employer and a barista; contact shared only if the barista agrees
--   job_invites             : the welcome letter to past students — sent / opened / clicked / joined, for the stats
--   geo_cache               : suburb → map position (from OpenStreetMap), so distance search doesn't look places up twice
-- Everything is read and written by the server (service role) or the office team; no public table access.
-- Nothing existing is changed. Safe to run more than once.
-- =====================================================================

create table if not exists public.job_profiles (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  student_id        uuid not null references public.booking_students(id) on delete cascade,
  status            text not null default 'draft' check (status in ('draft','active','hidden')),
  display_name      text check (char_length(display_name) <= 80),
  headline          text check (char_length(headline) <= 120),
  bio               text check (char_length(bio) <= 1500),
  photo_url         text check (photo_url is null or photo_url ~ '^https://'),
  suburb            text check (char_length(suburb) <= 80),
  state             text check (char_length(state) <= 10),
  postcode          text check (postcode is null or postcode ~ '^[0-9]{4}$'),
  lat               double precision,
  lng               double precision,
  travel_km         integer not null default 20 check (travel_km between 1 and 500),
  experience        text check (experience in ('new','some','experienced','pro')),
  skills            text[] not null default '{}',
  work_types        text[] not null default '{}',
  availability      jsonb not null default '{}'::jsonb check (jsonb_typeof(availability) = 'object'),
  availability_note text check (char_length(availability_note) <= 300),
  share_email       boolean not null default false,
  share_phone       boolean not null default false,
  show_certificates boolean not null default true,
  activated_at      timestamptz,
  last_active_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id),
  unique (id, organisation_id)
);
create index if not exists job_profiles_active_idx on public.job_profiles (organisation_id, status);

create table if not exists public.job_employers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  business_name    text not null check (char_length(business_name) between 1 and 120),
  contact_name     text not null check (char_length(contact_name) between 1 and 120),
  email            text not null check (char_length(email) <= 254),
  phone            text check (char_length(phone) <= 40),
  website          text check (char_length(website) <= 200),
  suburb           text check (char_length(suburb) <= 80),
  lat              double precision,
  lng              double precision,
  about            text check (char_length(about) <= 1500),
  status           text not null default 'pending' check (status in ('pending','approved','blocked')),
  approved_at      timestamptz,
  approved_by      uuid references public.users(id),
  last_active_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id)
);
create unique index if not exists job_employers_email_uq on public.job_employers (organisation_id, lower(email));

create table if not exists public.job_employer_logins (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  employer_id      uuid not null references public.job_employers(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);
create table if not exists public.job_employer_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  employer_id      uuid not null references public.job_employers(id) on delete cascade,
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at       timestamptz not null,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.job_posts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  employer_id      uuid not null,
  title            text not null check (char_length(title) between 3 and 120),
  kind             text not null default 'one_off' check (kind in ('one_off','event','regular','ongoing')),
  description      text check (char_length(description) <= 3000),
  suburb           text check (char_length(suburb) <= 80),
  lat              double precision,
  lng              double precision,
  starts_on        date,
  ends_on          date,
  times            text check (char_length(times) <= 120),
  pay              text check (char_length(pay) <= 80),
  positions        integer not null default 1 check (positions between 1 and 50),
  status           text not null default 'open' check (status in ('open','filled','closed','removed')),
  filled_at        timestamptz,
  views            integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (employer_id, organisation_id) references public.job_employers(id, organisation_id) on delete cascade
);
create index if not exists job_posts_open_idx on public.job_posts (organisation_id, status, created_at desc);

create table if not exists public.job_threads (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations(id) on delete cascade,
  employer_id        uuid not null,
  profile_id         uuid not null,
  post_id            uuid references public.job_posts(id) on delete set null,
  started_by         text not null check (started_by in ('employer','barista')),
  contact_requested  boolean not null default false,
  contact_shared     boolean not null default false,
  employer_unread    integer not null default 0,
  barista_unread     integer not null default 0,
  employer_notified_at timestamptz,
  barista_notified_at  timestamptz,
  last_message_at    timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (employer_id, organisation_id) references public.job_employers(id, organisation_id) on delete cascade,
  foreign key (profile_id, organisation_id) references public.job_profiles(id, organisation_id) on delete cascade
);
create unique index if not exists job_threads_pair_uq on public.job_threads (employer_id, profile_id, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.job_messages (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  thread_id        uuid not null,
  sender           text not null check (sender in ('employer','barista','system')),
  body             text not null check (char_length(body) between 1 and 3000),
  created_at       timestamptz not null default now(),
  foreign key (thread_id, organisation_id) references public.job_threads(id, organisation_id) on delete cascade
);
create index if not exists job_messages_thread_idx on public.job_messages (thread_id, created_at);

create table if not exists public.job_invites (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  student_id       uuid not null references public.booking_students(id) on delete cascade,
  email            text not null,
  token            text not null default encode(extensions.gen_random_bytes(20), 'hex'),
  status           text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  queued_at        timestamptz not null default now(),
  sent_at          timestamptz,
  opened_at        timestamptz,
  clicked_at       timestamptz,
  joined_at        timestamptz,
  error            text check (char_length(error) <= 300),
  unique (organisation_id, student_id),
  unique (token)
);
create index if not exists job_invites_queue_idx on public.job_invites (status, queued_at) where status = 'queued';

create table if not exists public.geo_cache (
  query       text primary key check (char_length(query) <= 160),
  lat         double precision,
  lng         double precision,
  label       text,
  created_at  timestamptz not null default now()
);

alter table public.booking_students add column if not exists jobs_unsubscribed_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['job_profiles','job_employers','job_posts'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- Office team can see and manage everything for its organisation; nobody else gets table access
do $$
declare t text;
begin
  foreach t in array array['job_profiles','job_employers','job_posts','job_threads','job_messages','job_invites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_staff(organisation_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id))', t || '_update', t);
  end loop;
end $$;
alter table public.job_employer_logins enable row level security;
alter table public.job_employer_sessions enable row level security;
alter table public.geo_cache enable row level security;
