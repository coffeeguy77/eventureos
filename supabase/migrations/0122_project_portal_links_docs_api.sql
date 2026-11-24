-- 0122: Projects — a short link (webculture.au/tradeup), a documents folder and document links, a key so a dev chat
-- (Claude Code, Cursor) can log its work straight onto the project, and client owners managing their own staff.
-- Safe to run more than once. Includes 0121 (date ranges) in case it hasn't been run.

-- 0121 again: a task can span days
alter table public.nh_project_time add column if not exists work_date_to date;
alter table public.nh_project_time drop constraint if exists nh_project_time_date_range;
alter table public.nh_project_time add constraint nh_project_time_date_range check (work_date_to is null or work_date_to >= work_date);

-- Short link and documents
alter table public.nh_projects add column if not exists short_slug text;
alter table public.nh_projects drop constraint if exists nh_projects_short_slug_check;
alter table public.nh_projects add constraint nh_projects_short_slug_check check (short_slug is null or short_slug ~ '^[a-z0-9][a-z0-9-]{1,39}$');
create unique index if not exists nh_projects_short_slug on public.nh_projects (organisation_id, short_slug) where short_slug is not null;
alter table public.nh_projects add column if not exists docs_url text;
alter table public.nh_projects add column if not exists docs jsonb not null default '[]'::jsonb;

-- Dev chat keys: only a hash is kept; managers only
create table if not exists public.nh_project_keys (
  project_id uuid primary key references public.nh_projects(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.nh_project_keys enable row level security;
drop policy if exists "nh_project_keys managers" on public.nh_project_keys;
create policy "nh_project_keys managers" on public.nh_project_keys for all to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Portal access can be removed (by you, or by the client's owner for their own staff) without deleting the contact
alter table public.contacts drop constraint if exists contacts_portal_role_check;
alter table public.contacts add constraint contacts_portal_role_check check (portal_role in ('accounts', 'team', 'removed'));

create or replace function public.portal_customer_ids()
 returns setof uuid language sql stable security definer set search_path to ''
as $$
  select ct.customer_id from public.contacts ct
  join public.organisation_users ou on ou.organisation_id = ct.organisation_id and ou.user_id = auth.uid()
       and ou.status = 'active' and (ou.expires_at is null or ou.expires_at > now())
  join public.organisations o on o.id = ct.organisation_id and o.status = 'active'
  where ct.portal_user_id = auth.uid() and ct.portal_role <> 'removed';
$$;

-- Signing in never re-links a contact whose access was removed
create or replace function public.portal_claim_access(p_slug text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_org uuid;
  v_email text;
begin
  select id into v_org from public.organisations where slug = lower(p_slug) and status = 'active';
  if v_org is null then raise exception 'Unknown business'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then raise exception 'Please verify your email first'; end if;

  update public.contacts set portal_user_id = auth.uid()
  where organisation_id = v_org and lower(email) = v_email and (portal_user_id is null or portal_user_id = auth.uid()) and portal_role <> 'removed';

  insert into public.contacts (organisation_id, customer_id, first_name, email, is_primary, portal_user_id)
  select c.organisation_id, c.id, split_part(c.name, ' ', 1), c.email, false, auth.uid()
  from public.customers c
  where c.organisation_id = v_org and lower(c.email) = v_email
    and not exists (select 1 from public.contacts ct where ct.customer_id = c.id and (ct.portal_user_id = auth.uid() or lower(ct.email) = v_email));

  if exists (select 1 from public.contacts where organisation_id = v_org and portal_user_id = auth.uid() and portal_role <> 'removed') then
    insert into public.organisation_users (organisation_id, user_id, role)
    values (v_org, auth.uid(), 'customer')
    on conflict (organisation_id, user_id) do nothing;
    return jsonb_build_object('linked', true, 'organisation_id', v_org);
  end if;
  return jsonb_build_object('linked', false, 'organisation_id', v_org);
end $function$;

notify pgrst, 'reload schema';
