-- =====================================================================
-- EventureOS 0095 — Nerd Herd password vault + one-click WordPress support sign-in
--   nerd_vault_items    : a saved login for a client / website (label, address, username). The password and any
--                         private notes are NOT in this table — they're encrypted in Supabase Vault (vault.secrets)
--                         and only the server can decrypt them, after checking the person and their PIN.
--   nerd_vault_members  : who in the business can use the vault (picked per person) and their PIN (hashed).
--   nerd_vault_log      : every reveal, copy, change and support sign-in — who and when.
--   vault_store / vault_read / vault_drop : server-only helpers (service role) around Supabase Vault.
--   website_maintenance_runs.action gains 'login' (support sign-ins through the Web Culture Connector).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

create extension if not exists supabase_vault;

create table if not exists public.nerd_vault_items (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  website_id       uuid references public.websites(id) on delete set null,
  label            text not null check (char_length(label) between 1 and 200),
  kind             text not null default 'wordpress' check (kind in ('wordpress', 'hosting', 'domain', 'email', 'ftp', 'database', 'dns', 'social', 'other')),
  url              text,
  username         text,
  secret_id        uuid,            -- vault.secrets: the password
  notes_secret_id  uuid,            -- vault.secrets: private notes (optional)
  has_password     boolean not null default false,
  has_notes        boolean not null default false,
  created_by       uuid references public.users(id) on delete set null,
  updated_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  password_changed_at timestamptz,
  last_revealed_at timestamptz,
  last_revealed_by uuid references public.users(id) on delete set null
);
create index if not exists nerd_vault_items_org on public.nerd_vault_items (organisation_id, customer_id);
create index if not exists nerd_vault_items_site on public.nerd_vault_items (website_id);

create table if not exists public.nerd_vault_members (
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  pin_hash         text,            -- scrypt, made on the server
  pin_set_at       timestamptz,
  failed           integer not null default 0,
  locked_until     timestamptz,
  added_by         uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create table if not exists public.nerd_vault_log (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  item_id          uuid references public.nerd_vault_items(id) on delete set null,
  website_id       uuid references public.websites(id) on delete set null,
  user_id          uuid references public.users(id) on delete set null,
  actor            text,
  action           text not null check (action in ('reveal', 'copy', 'create', 'update', 'delete', 'login', 'unlock', 'pin_failed', 'access')),
  detail           text,
  at               timestamptz not null default now()
);
create index if not exists nerd_vault_log_org on public.nerd_vault_log (organisation_id, at desc);
create index if not exists nerd_vault_log_item on public.nerd_vault_log (item_id, at desc);

-- Is the signed-in person allowed to use this business's vault?
create or replace function public.is_vault_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_team(org) and exists (select 1 from public.nerd_vault_members m where m.organisation_id = org and m.user_id = auth.uid());
$$;

-- Server-only helpers around Supabase Vault (the service role calls these; nobody signed in can)
create or replace function public.vault_store(p_secret text, p_name text, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if p_id is not null and exists (select 1 from vault.secrets where id = p_id) then
    perform vault.update_secret(p_id, p_secret);
    return p_id;
  end if;
  select vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text, 'EventureOS Nerd Herd vault') into v;
  return v;
end $$;

create or replace function public.vault_read(p_id uuid)
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

create or replace function public.vault_drop(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from vault.secrets where id = p_id;
$$;

revoke all on function public.vault_store(text, text, uuid) from public, anon, authenticated;
revoke all on function public.vault_read(uuid) from public, anon, authenticated;
revoke all on function public.vault_drop(uuid) from public, anon, authenticated;
grant execute on function public.vault_store(text, text, uuid) to service_role;
grant execute on function public.vault_read(uuid) to service_role;
grant execute on function public.vault_drop(uuid) to service_role;

-- Security: vault members can see the list (labels, addresses, usernames) and the log; managers can see who's
-- a member. All writes go through the server (which checks the PIN), so there are no write rules here.
alter table public.nerd_vault_items enable row level security;
alter table public.nerd_vault_members enable row level security;
alter table public.nerd_vault_log enable row level security;
drop policy if exists nerd_vault_items_select on public.nerd_vault_items;
create policy nerd_vault_items_select on public.nerd_vault_items for select to authenticated using (public.is_vault_member(organisation_id));
drop policy if exists nerd_vault_members_select on public.nerd_vault_members;
create policy nerd_vault_members_select on public.nerd_vault_members for select to authenticated using (user_id = auth.uid() or public.is_org_manager(organisation_id));
drop policy if exists nerd_vault_log_select on public.nerd_vault_log;
create policy nerd_vault_log_select on public.nerd_vault_log for select to authenticated using (public.is_vault_member(organisation_id) or public.is_org_manager(organisation_id));

-- Support sign-ins appear in the site's maintenance history (staff only — not shown to the client)
alter table public.website_maintenance_runs drop constraint if exists website_maintenance_runs_action_check;
alter table public.website_maintenance_runs add constraint website_maintenance_runs_action_check
  check (action in ('connect', 'check', 'update', 'purge', 'disconnect', 'lock', 'unlock', 'login', 'other'));
