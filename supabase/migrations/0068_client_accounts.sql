-- 0068 — Client accounts and app access.
--  * organisations.app_access: which optional apps a business has (null = all of them, for businesses set up before
--    this existed). Only the platform owner (super admin) can change it — a guard trigger stops anyone else, even the
--    business's own owner.
--  * platform_settings: platform-wide settings, e.g. which apps each plan includes. Read by signed-in users, written
--    by super admins.
--  * Invitations can now invite an owner (for client accounts set up by the platform owner).
--  * admin_create_organisation(): the platform owner sets up a client account and invites its owner by email.
--  * admin_set_organisation_apps(): the platform owner changes a client's apps.

alter table public.organisations add column if not exists app_access text[];

create or replace function public.guard_app_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.app_access is distinct from old.app_access
     and coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not public.is_super_admin() then
    raise exception 'Only EventureOS can change which apps a business has';
  end if;
  return new;
end $$;
drop trigger if exists guard_app_access on public.organisations;
create trigger guard_app_access before update on public.organisations for each row execute function public.guard_app_access();

create table if not exists public.platform_settings (
  key text primary key check (char_length(key) between 1 and 80),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings for select to authenticated using (true);
drop policy if exists platform_settings_write on public.platform_settings;
create policy platform_settings_write on public.platform_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

alter table public.organisation_invitations drop constraint if exists organisation_invitations_role_check;
alter table public.organisation_invitations add constraint organisation_invitations_role_check check (role in ('owner', 'admin', 'manager', 'sales', 'staff'));

create or replace function public.admin_create_organisation(
  p_name text, p_slug text, p_business_type text, p_plan text, p_timezone text, p_apps text[], p_owner_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_org uuid;
  v_email text := lower(trim(coalesce(p_owner_email, '')));
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Business name is required'; end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9][a-z0-9-]{1,59}$' then raise exception 'Choose a workspace ID with letters, numbers and dashes'; end if;
  if p_plan not in ('trial', 'starter', 'growth', 'scale') then raise exception 'Choose a plan'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter the owner''s email address'; end if;

  insert into public.organisations (name, slug, business_type, plan, timezone, app_access, created_by)
  values (trim(p_name), p_slug, nullif(trim(coalesce(p_business_type, '')), ''), p_plan, coalesce(nullif(p_timezone, ''), 'Australia/Sydney'), coalesce(p_apps, '{}'), uid)
  returning id into new_org;

  -- the same starting setup as a business that signs up itself (see create_organisation)
  insert into public.calendar_connections (organisation_id, name, is_default, created_by)
  values (new_org, 'Main Events', true, uid);
  insert into public.integrations (organisation_id, provider)
  values (new_org, 'gmail'), (new_org, 'google_calendar'), (new_org, 'xero');
  insert into public.automation_rules (organisation_id, name, trigger_type, actions, enabled, created_by) values
    (new_org, 'Follow up unanswered quotes', 'quote.no_reply',
      '[{"type":"flag_follow_up"},{"type":"create_task","params":{"title":"Follow up quote"}}]', true, uid),
    (new_org, 'Quote accepted → confirm event', 'quote.accepted',
      '[{"type":"set_event_status","params":{"status":"confirmed"}},{"type":"create_calendar_event"},{"type":"create_invoice","params":{"kind":"deposit"}},{"type":"notify_assigned"}]', true, uid);

  -- the client's owner gets access when they sign in with this email
  insert into public.organisation_invitations (organisation_id, email, role, invited_by)
  values (new_org, v_email, 'owner', uid);

  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (new_org, uid, 'organisation.created', 'organisation', new_org, 'Account set up by EventureOS; owner invited: ' || v_email);
  return new_org;
end $$;
revoke all on function public.admin_create_organisation(text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.admin_create_organisation(text, text, text, text, text, text[], text) to authenticated;

create or replace function public.admin_set_organisation_apps(p_org uuid, p_apps text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  update public.organisations set app_access = p_apps, updated_at = now() where id = p_org;
  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (p_org, auth.uid(), 'organisation.apps', 'organisation', p_org,
          case when p_apps is null then 'Apps: all' else 'Apps: ' || coalesce(nullif(array_to_string(p_apps, ', '), ''), 'core only') end);
end $$;
revoke all on function public.admin_set_organisation_apps(uuid, text[]) from public, anon;
grant execute on function public.admin_set_organisation_apps(uuid, text[]) to authenticated;
