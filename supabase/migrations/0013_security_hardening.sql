-- =====================================================================
-- EventureOS 0013 — security hardening (independent review findings)
--   1. documents storage policy: portal read compared d.storage_path to d.name
--      (unqualified `name` resolved to the documents table). Now compares to
--      objects.name and requires the file to sit in the document's own org folder.
--   2. invoices / payments: insert + update limited to owners, admins, managers.
--   3. integration tokens: managers, or staff when the call comes from the
--      EventureOS server (server key checked against a stored hash).
--   4. support sessions can't extend or re-shape their own membership.
--   5. suspended organisations lose access (has_org_role + portal).
--   6. portal_add_document: the event must belong to the customer.
--   7. website form: per-IP rate limit; no auto-linking to existing
--      customers from an unverified email address.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Storage: customer portal read of shared documents
-- ---------------------------------------------------------------------
drop policy if exists "documents: portal read shared" on storage.objects;
create policy "documents: portal read shared" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = objects.name
        and d.organisation_id = public.try_uuid((storage.foldername(objects.name))[1])
        and d.visibility = 'customer'
        and d.customer_id in (select public.portal_customer_ids())
    )
  );

-- ---------------------------------------------------------------------
-- 2. Invoices and payments: money changes are manager-level
-- ---------------------------------------------------------------------
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.is_org_manager(organisation_id));
create policy invoices_update on public.invoices for update to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_org_manager(organisation_id));
create policy payments_update on public.payments for update to authenticated
  using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- ---------------------------------------------------------------------
-- 3. Integration tokens
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.server_keys (
  name text primary key,
  key_sha256 text not null,
  created_at timestamptz not null default now()
);
revoke all on private.server_keys from public, anon, authenticated;

-- sha256 of the INTEGRATION_SERVER_KEY environment variable set in Vercel.
-- To rotate: set a new env var value and update this hash.
insert into private.server_keys (name, key_sha256)
values ('integration', '7eb95f66ba669702e11b992822ee494fcc0f0e1e8ab1fd13369ff9371c6249b6')
on conflict (name) do update set key_sha256 = excluded.key_sha256, created_at = now();

create or replace function public._integration_token_access(p_integration_id uuid, p_server_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organisation_id into v_org from public.integrations where id = p_integration_id;
  if v_org is null then return false; end if;
  if public.is_org_manager(v_org) then return true; end if;
  if public.is_org_staff(v_org) and p_server_key is not null and exists (
       select 1 from private.server_keys k
       where k.name = 'integration'
         and k.key_sha256 = encode(extensions.digest(convert_to(p_server_key, 'UTF8'), 'sha256'), 'hex')) then
    return true;
  end if;
  return false;
end $$;

drop function if exists public.get_integration_tokens(uuid);
drop function if exists public.update_integration_access_token(uuid, text, timestamptz, text);

create function public.get_integration_tokens(p_integration_id uuid, p_server_key text default null)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public._integration_token_access(p_integration_id, p_server_key) then
    raise exception 'Integration not found';
  end if;
  return query select c.access_token, c.refresh_token, c.expires_at
               from public.integration_credentials c where c.integration_id = p_integration_id;
end $$;

create function public.update_integration_access_token(p_integration_id uuid, p_access_token text,
  p_expires_at timestamptz, p_refresh_token text default null, p_server_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public._integration_token_access(p_integration_id, p_server_key) then
    raise exception 'Integration not found';
  end if;
  update public.integration_credentials set access_token = p_access_token, expires_at = p_expires_at,
    refresh_token = coalesce(p_refresh_token, refresh_token), updated_at = now()
  where integration_id = p_integration_id;
end $$;

revoke all on function public._integration_token_access(uuid, text) from public, anon, authenticated;
revoke all on function public.get_integration_tokens(uuid, text) from public, anon;
revoke all on function public.update_integration_access_token(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.get_integration_tokens(uuid, text) to authenticated;
grant execute on function public.update_integration_access_token(uuid, text, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Support sessions: only a platform admin can change a support row's
--    role, title or expiry, or re-activate it.
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
  if (old.title = 'EventureOS Support' or old.expires_at is not null) and not public.is_super_admin() then
    if new.expires_at is distinct from old.expires_at or new.title is distinct from old.title
       or new.role is distinct from old.role or (new.status = 'active' and old.status <> 'active') then
      raise exception 'Temporary access can only be changed by EventureOS';
    end if;
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

-- Temporary rows can't be created with an expiry by non-platform users either
-- (an admin creating a time-limited "support" row for someone is harmless, but
-- nobody except the platform may create rows titled as EventureOS Support).
create or replace function public.guard_support_membership_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.title = 'EventureOS Support' and not public.is_super_admin() then
    raise exception 'Only EventureOS can create support access';
  end if;
  return new;
end $$;
drop trigger if exists organisation_users_guard_support_insert on public.organisation_users;
create trigger organisation_users_guard_support_insert before insert on public.organisation_users
  for each row execute function public.guard_support_membership_insert();
revoke all on function public.guard_support_membership_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Suspended organisations lose access
-- ---------------------------------------------------------------------
create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organisation_users ou
    join public.organisations o on o.id = ou.organisation_id
    where ou.organisation_id = org
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and (ou.expires_at is null or ou.expires_at > now())
      and o.status = 'active'
      and ou.role = any(roles));
$$;

create or replace function public.portal_customer_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select ct.customer_id from public.contacts ct
  join public.organisation_users ou on ou.organisation_id = ct.organisation_id and ou.user_id = auth.uid()
       and ou.status = 'active' and (ou.expires_at is null or ou.expires_at > now())
  join public.organisations o on o.id = ct.organisation_id and o.status = 'active'
  where ct.portal_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 6. Portal uploads: event must belong to the customer
-- ---------------------------------------------------------------------
create or replace function public.portal_add_document(p_customer_id uuid, p_event_id uuid, p_request_id uuid,
  p_name text, p_path text, p_mime text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  if p_customer_id not in (select public.portal_customer_ids()) then raise exception 'Not allowed'; end if;
  select organisation_id into v_org from public.customers where id = p_customer_id;
  if p_event_id is not null and not exists (
       select 1 from public.events e where e.id = p_event_id and e.customer_id = p_customer_id and e.organisation_id = v_org) then
    raise exception 'Not allowed';
  end if;
  if split_part(p_path, '/', 1) <> v_org::text or split_part(p_path, '/', 2) <> 'portal' then raise exception 'Invalid file location'; end if;
  if p_request_id is not null then
    update public.documents set name = p_name, storage_path = p_path, mime_type = p_mime, size_bytes = p_size,
      requested_from_customer = false, uploaded_by = auth.uid(), updated_at = now()
    where id = p_request_id and customer_id = p_customer_id and requested_from_customer
    returning id into v_id;
  end if;
  if v_id is null then
    insert into public.documents (organisation_id, name, storage_path, mime_type, size_bytes, customer_id, event_id, visibility, uploaded_by)
    values (v_org, p_name, p_path, p_mime, p_size, p_customer_id, p_event_id, 'customer', auth.uid())
    returning id into v_id;
  end if;
  insert into public.notifications (organisation_id, type, title, body, link, entity_type, entity_id)
  values (v_org, 'document.uploaded', 'Customer uploaded a document', p_name,
          coalesce('/events/' || p_event_id || '?tab=documents', '/clients/' || p_customer_id), 'document', v_id);
  insert into public.activity_logs (organisation_id, actor_id, actor_type, action, entity_type, entity_id, customer_id, event_id, summary)
  values (v_org, auth.uid(), 'customer', 'document.uploaded', 'document', v_id, p_customer_id, p_event_id, 'Customer uploaded ' || p_name);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 7. Website enquiry capture: per-IP limit, no auto-linking
-- ---------------------------------------------------------------------
create table if not exists private.form_submissions (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists form_submissions_ip_idx on private.form_submissions (ip_hash, created_at);
revoke all on private.form_submissions from public, anon, authenticated;

drop function if exists public.capture_website_enquiry(text, text, jsonb);
create function public.capture_website_enquiry(p_slug text, p_key text, p_payload jsonb, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organisations%rowtype;
  v_email text := lower(nullif(trim(p_payload->>'email'), ''));
  v_name text := left(nullif(trim(p_payload->>'name'), ''), 200);
  v_msg text := left(nullif(trim(p_payload->>'message'), ''), 5000);
  v_ip text := encode(extensions.digest(convert_to(coalesce(nullif(trim(p_ip), ''), 'unknown'), 'UTF8'), 'sha256'), 'hex');
  v_id uuid;
  v_number integer;
  v_assignee uuid;
  v_date date;
begin
  select * into o from public.organisations where slug = lower(p_slug) and status = 'active';
  if o.id is null or o.public_form_key is distinct from p_key then raise exception 'Invalid form key'; end if;
  if v_name is null and v_email is null then raise exception 'Name or email is required'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email'; end if;

  -- One sender: 5 per 10 minutes. Everyone together: 60 per 10 minutes per organisation.
  if (select count(*) from private.form_submissions where ip_hash = v_ip and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many enquiries — please try again shortly';
  end if;
  if (select count(*) from public.enquiries where organisation_id = o.id and source = 'website' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Too many enquiries — please try again shortly';
  end if;
  insert into private.form_submissions (organisation_id, ip_hash) values (o.id, v_ip);
  delete from private.form_submissions where created_at < now() - interval '1 day';

  begin v_date := nullif(p_payload->>'event_date', '')::date; exception when others then v_date := null; end;

  if exists (select 1 from public.automation_rules where organisation_id = o.id and trigger_type = 'enquiry.created' and enabled) then
    select ou.user_id into v_assignee from public.organisation_users ou
    left join public.enquiries e on e.assigned_to = ou.user_id and e.organisation_id = o.id and e.status in ('new','needs_review','contacted','qualified','quote_required')
    where ou.organisation_id = o.id and ou.status = 'active' and ou.role in ('owner','admin','manager','staff') and ou.expires_at is null
    group by ou.user_id order by count(e.id), min(ou.created_at) limit 1;
  end if;

  -- Not linked to an existing customer automatically: the email address is unverified.
  -- Staff link it when they convert the enquiry (the enquiry page suggests matches).
  insert into public.enquiries (organisation_id, customer_id, contact_id, title, contact_name, contact_email, contact_phone, company,
                                event_type, event_date, guest_count, budget, venue, message, source, status, classification,
                                classification_confidence, assigned_to, received_at, next_action, next_action_due)
  values (o.id, null, null,
          left(coalesce(nullif(trim(p_payload->>'title'), ''), nullif(trim(p_payload->>'event_type'), '') || ' enquiry', 'Website enquiry'), 200),
          v_name, v_email, left(nullif(trim(p_payload->>'phone'), ''), 40), left(nullif(trim(p_payload->>'company'), ''), 200),
          left(nullif(trim(p_payload->>'event_type'), ''), 80), v_date,
          public.try_int(p_payload->>'guests'), public.try_numeric(p_payload->>'budget'),
          left(nullif(trim(p_payload->>'venue'), ''), 200), v_msg, 'website', 'new', 'event_enquiry', 0.99, v_assignee, now(),
          'Reply to the enquiry', now() + interval '4 hours')
  returning id, number into v_id, v_number;

  insert into public.activity_logs (organisation_id, actor_type, actor_label, action, entity_type, entity_id, enquiry_id, summary)
  values (o.id, 'system', 'Website form', 'enquiry.received', 'enquiry', v_id, v_id,
          'Enquiry received — ' || coalesce(v_name, v_email) || ' via website form');
  insert into public.notifications (organisation_id, user_id, type, title, body, link, entity_type, entity_id)
  values (o.id, null, 'enquiry.new', 'New enquiry from ' || coalesce(v_name, v_email), left(coalesce(v_msg, ''), 140), '/enquiries/' || v_id, 'enquiry', v_id);
  return jsonb_build_object('ok', true, 'reference', 'ENQ-' || v_number);
end $$;
revoke all on function public.capture_website_enquiry(text, text, jsonb, text) from public;
grant execute on function public.capture_website_enquiry(text, text, jsonb, text) to anon, authenticated;
