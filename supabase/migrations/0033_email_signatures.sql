-- Email signatures (Phase 1): one master design per organisation + each team member's personal details.
--   email_signatures          — the organisation's draft design and which version is live
--   email_signature_versions  — immutable published designs (roll back = copy a version into the draft)
--   signature_profiles        — a team member's personal details (name, title, numbers, photo…)
--   email_messages.body_html / signature_version — a snapshot of exactly what was sent
-- Designs are structured JSON (layout, blocks, tokens) compiled to email-safe HTML by lib/signatures/render.ts —
-- no stored free-form HTML.

create table if not exists public.email_signatures (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  draft_updated_at timestamptz not null default now(),
  draft_updated_by uuid references public.users(id) on delete set null,
  published_version int,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.email_signature_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  version int not null,
  design jsonb not null,
  note text check (char_length(note) <= 200),
  published_at timestamptz not null default now(),
  published_by uuid references public.users(id) on delete set null,
  unique (organisation_id, version)
);

create table if not exists public.signature_profiles (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  pronouns text check (char_length(pronouns) <= 30),
  title text check (char_length(title) <= 80),
  phone text check (char_length(phone) <= 40),
  mobile text check (char_length(mobile) <= 40),
  email text check (char_length(email) <= 200),
  photo_url text check (char_length(photo_url) <= 500),
  extra_line text check (char_length(extra_line) <= 120),
  booking_url text check (char_length(booking_url) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key (organisation_id, user_id)
);

alter table public.email_messages
  add column if not exists body_html text,
  add column if not exists signature_version int;

alter table public.email_signatures enable row level security;
alter table public.email_signature_versions enable row level security;
alter table public.signature_profiles enable row level security;

-- Everyone on the team can see the design (they need it to preview/copy their own signature);
-- owners and admins change it.
drop policy if exists email_signatures_read on public.email_signatures;
create policy email_signatures_read on public.email_signatures for select to authenticated using (public.is_org_team(organisation_id));
drop policy if exists email_signatures_write on public.email_signatures;
create policy email_signatures_write on public.email_signatures for all to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));

drop policy if exists email_signature_versions_read on public.email_signature_versions;
create policy email_signature_versions_read on public.email_signature_versions for select to authenticated using (public.is_org_team(organisation_id));
drop policy if exists email_signature_versions_insert on public.email_signature_versions;
create policy email_signature_versions_insert on public.email_signature_versions for insert to authenticated
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));

-- Personal details: the team can read them (previews, rosters); each person edits their own; owners/admins edit anyone's.
drop policy if exists signature_profiles_read on public.signature_profiles;
create policy signature_profiles_read on public.signature_profiles for select to authenticated using (public.is_org_team(organisation_id));
drop policy if exists signature_profiles_write on public.signature_profiles;
create policy signature_profiles_write on public.signature_profiles for all to authenticated
  using ((user_id = auth.uid() and public.is_org_team(organisation_id)) or public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]))
  with check ((user_id = auth.uid() and public.is_org_team(organisation_id)) or public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));

-- Staff photos live in the public branding bucket under <org>/people/<user>/…; each person manages their own.
drop policy if exists "branding: team member own photo upload" on storage.objects;
create policy "branding: team member own photo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3] = auth.uid()::text
              and public.is_org_team(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists "branding: team member own photo delete" on storage.objects;
create policy "branding: team member own photo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (storage.foldername(name))[2] = 'people' and (storage.foldername(name))[3] = auth.uid()::text
         and public.is_org_team(public.try_uuid((storage.foldername(name))[1])));
