-- =====================================================================
-- EventureOS 0093 — speed: make the "is this person allowed?" checks cheap
--
-- Every table's security rules ask "is this user staff / a manager in this business?" — once PER ROW. Each check
-- looked the person up in organisation_users again, so a list of 500 notifications did 1,000 lookups (~190 ms for
-- one badge count). Now the person's role in a business is looked up once per request and remembered for the rest
-- of that request. Same answers as before (measured ~18× faster on the notification count).
--
-- Rules unchanged: active membership, not expired, business active, role in the allowed list. Only a found
-- membership is remembered (so someone added mid-request is seen straight away). Nothing is kept between requests.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

-- The signed-in person's role in a business ('' / null when they're not a member), remembered for this request.
create or replace function public.my_org_role(org uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); k text; v text; r text;
begin
  if u is null or org is null then return null; end if;
  k := 'eos.role_' || replace(org::text, '-', '');
  v := current_setting(k, true);
  if v is not null and v <> '' and split_part(v, ':', 1) = u::text then return split_part(v, ':', 2); end if;
  select ou.role::text into r
    from public.organisation_users ou join public.organisations o on o.id = ou.organisation_id
   where ou.organisation_id = org and ou.user_id = u and ou.status = 'active'
     and (ou.expires_at is null or ou.expires_at > now()) and o.status = 'active'
   limit 1;
  if r is not null then perform set_config(k, u::text || ':' || r, true); end if;
  return r;
end $$;
revoke all on function public.my_org_role(uuid) from public, anon;
grant execute on function public.my_org_role(uuid) to authenticated, service_role;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_org_role(org)::public.org_role = any (roles), false);
$$;

create or replace function public.is_org_staff(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_org_role(org) = any (array['owner', 'admin', 'manager', 'sales']), false);
$$;

create or replace function public.is_org_manager(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_org_role(org) = any (array['owner', 'admin', 'manager']), false);
$$;

create or replace function public.is_org_team(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_org_role(org) = any (array['owner', 'admin', 'manager', 'sales', 'staff']), false);
$$;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_org_role(org) = any (array['owner', 'admin', 'manager', 'staff', 'customer']), false);
$$;

-- Platform admin (EventureOS staff): looked up once per request too
create or replace function public.is_super_admin()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); v text; r boolean;
begin
  if u is null then return false; end if;
  v := current_setting('eos.super_admin', true);
  if v is not null and v <> '' and split_part(v, ':', 1) = u::text then return split_part(v, ':', 2) = 't'; end if;
  select exists (select 1 from public.platform_admins where user_id = u) into r;
  perform set_config('eos.super_admin', u::text || ':' || case when r then 't' else 'f' end, true);
  return r;
end $$;
