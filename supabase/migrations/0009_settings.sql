-- =====================================================================
-- EventureOS 0009 — settings & super admin
--   * public `branding` bucket (logos for the customer portal / quotes)
--   * regenerate_public_form_key(p_org)
--   * guard rails: owner role changes, platform-controlled organisation
--     columns, automation rules editable by managers only
--   * admin_system_health(), admin_support_audit()
-- Additive only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Branding bucket (public read; owner/admin of the org write under <org_id>/)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

-- Public bucket: files are served to anyone via /storage/v1/object/public/branding/...
-- Listing is limited to the organisation's own staff.
create policy "branding: staff list own org" on storage.objects for select to authenticated
  using (bucket_id = 'branding' and public.is_org_staff(public.try_uuid((storage.foldername(name))[1])));
create policy "branding: owner/admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
              and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.org_role[]));
create policy "branding: owner/admin update" on storage.objects for update to authenticated
  using (bucket_id = 'branding'
         and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.org_role[]))
  with check (bucket_id = 'branding'
              and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.org_role[]));
create policy "branding: owner/admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
         and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.org_role[]));

-- ---------------------------------------------------------------------
-- Website form key rotation
-- ---------------------------------------------------------------------
create or replace function public.regenerate_public_form_key(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_key text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.org_role[]) then
    raise exception 'Only owners and admins can regenerate the website form key';
  end if;
  update public.organisations set public_form_key = v_key where id = p_org;
  insert into public.activity_logs (organisation_id, actor_id, action, entity_type, entity_id, summary)
  values (p_org, auth.uid(), 'organisation.form_key_regenerated', 'organisation', p_org,
          coalesce((select coalesce(full_name, email) from public.users where id = auth.uid()), 'Someone')
            || ' regenerated the website enquiry form key (the old key stops working immediately)');
  return v_key;
end $$;

-- ---------------------------------------------------------------------
-- Organisation columns only the platform may change (plan, status, form key).
-- Owner/admin RLS allows updating the row; this stops direct API edits of
-- these columns. SECURITY DEFINER functions (admin_set_organisation_status,
-- regenerate_public_form_key) run as the function owner and are allowed.
-- ---------------------------------------------------------------------
create or replace function public.guard_organisation_platform_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.plan is distinct from old.plan or new.status is distinct from old.status then
      raise exception 'Plan and status are managed by EventureOS';
    end if;
    if new.public_form_key is distinct from old.public_form_key then
      raise exception 'Use "Regenerate key" to change the website form key';
    end if;
  end if;
  return new;
end $$;
create trigger organisations_guard_platform_columns before update on public.organisations
  for each row execute function public.guard_organisation_platform_columns();

-- ---------------------------------------------------------------------
-- Owner protection on memberships:
--   only owners grant/remove owner; you can't remove your own owner role;
--   an organisation always keeps at least one permanent active owner;
--   a membership can't be moved to another user/organisation.
-- Only applies to signed-in requests (auth.uid() set).
-- ---------------------------------------------------------------------
create or replace function public.guard_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  was_owner boolean := old.role = 'owner' and old.status = 'active' and old.expires_at is null;
  is_owner boolean := new.role = 'owner' and new.status = 'active' and new.expires_at is null;
begin
  if v_uid is null then return new; end if;
  if new.organisation_id is distinct from old.organisation_id or new.user_id is distinct from old.user_id then
    raise exception 'A membership can''t be moved to another person or organisation';
  end if;
  if was_owner is distinct from is_owner or (old.role = 'owner') is distinct from (new.role = 'owner') then
    if not public.has_org_role(old.organisation_id, array['owner']::public.org_role[]) then
      raise exception 'Only an owner can grant or remove owner access';
    end if;
    if was_owner and not is_owner then
      if old.user_id = v_uid then
        raise exception 'You can''t remove your own owner role — ask another owner to do it';
      end if;
      if not exists (select 1 from public.organisation_users ou
                     where ou.organisation_id = old.organisation_id and ou.id <> old.id and ou.role = 'owner'
                       and ou.status = 'active' and ou.expires_at is null) then
        raise exception 'An organisation must keep at least one owner';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger organisation_users_guard_owner before update on public.organisation_users
  for each row execute function public.guard_owner_membership();

-- ---------------------------------------------------------------------
-- Automation rules: owners, admins and managers only (staff may read).
-- Restrictive policies tighten the generic staff insert/update policies.
-- ---------------------------------------------------------------------
create policy automation_rules_managers_insert on public.automation_rules as restrictive for insert to authenticated
  with check (public.is_org_manager(organisation_id));
create policy automation_rules_managers_update on public.automation_rules as restrictive for update to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- ---------------------------------------------------------------------
-- Super admin: system health
-- ---------------------------------------------------------------------
create or replace function public.admin_system_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cron jsonb := jsonb_build_object('available', false);
  v_job jsonb;
  v_last jsonb;
  v_24h jsonb;
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;

  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$ select jsonb_build_object('jobid', jobid, 'schedule', schedule, 'active', active)
                from cron.job where jobname = 'eventureos-automations' limit 1 $q$ into v_job;
    execute $q$ select jsonb_build_object('status', d.status, 'start_time', d.start_time, 'end_time', d.end_time,
                                          'return_message', left(d.return_message, 500))
                from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                where j.jobname = 'eventureos-automations' order by d.start_time desc nulls last limit 1 $q$ into v_last;
    execute $q$ select jsonb_build_object('runs', count(*), 'failed', count(*) filter (where d.status = 'failed'))
                from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                where j.jobname = 'eventureos-automations' and d.start_time > now() - interval '24 hours' $q$ into v_24h;
    v_cron := jsonb_build_object('available', true, 'job', v_job, 'last_run', v_last, 'last_24h', v_24h);
  end if;

  return jsonb_build_object(
    'db_reachable', true,
    'checked_at', now(),
    'server_version', current_setting('server_version'),
    'cron', v_cron,
    'automation_runs_24h', (select jsonb_build_object('total', count(*), 'errors', count(*) filter (where status = 'error'))
                            from public.automation_runs where created_at > now() - interval '24 hours'),
    'integration_errors', (select count(*) from public.integrations where status = 'error'),
    'sync_failures_24h', (select count(*) from public.integration_sync_logs
                          where status = 'error' and started_at > now() - interval '24 hours'),
    'active_support_sessions', (select count(*) from public.organisation_users
                                where title = 'EventureOS Support' and status = 'active' and expires_at > now())
  );
end $$;

-- ---------------------------------------------------------------------
-- Super admin: support & platform audit trail across organisations
-- ---------------------------------------------------------------------
create or replace function public.admin_support_audit(p_limit integer default 200)
returns table (id uuid, created_at timestamptz, organisation_id uuid, organisation_name text,
               actor_name text, actor_email text, action text, summary text, metadata jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then raise exception 'Not allowed'; end if;
  return query
  select a.id, a.created_at, a.organisation_id, o.name, u.full_name, u.email, a.action, a.summary, a.metadata
  from public.activity_logs a
  join public.organisations o on o.id = a.organisation_id
  left join public.users u on u.id = coalesce(a.impersonated_by, a.actor_id)
  where a.impersonated_by is not null or a.action like 'support.%' or a.action like 'platform.%'
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function public.regenerate_public_form_key(uuid) from public, anon;
revoke all on function public.admin_system_health() from public, anon;
revoke all on function public.admin_support_audit(integer) from public, anon;
revoke all on function public.guard_owner_membership() from public, anon, authenticated;
revoke all on function public.guard_organisation_platform_columns() from public, anon, authenticated;
grant execute on function public.regenerate_public_form_key(uuid), public.admin_system_health(),
  public.admin_support_audit(integer) to authenticated;
