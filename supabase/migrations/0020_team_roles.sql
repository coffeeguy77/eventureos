-- =====================================================================
-- EventureOS 0020 — team roles & event staffing
--   Roles:  owner / admin / manager  — everything
--           sales                     — enquiries, clients, events, quotes (no invoices, payments, settings)
--           staff                     — field staff: only the jobs they're rostered on, never figures
--   ('sales' was added to org_role in a separate migration: enum values must commit before use)
-- =====================================================================

-- "Office" = anyone who works in the business system. Field staff are NOT office.
create or replace function public.is_org_staff(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_role(org, array['owner','admin','manager','sales']::public.org_role[]);
$$;

-- Anyone in the team, including field staff (not customers)
create or replace function public.is_org_team(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_org_role(org, array['owner','admin','manager','sales','staff']::public.org_role[]);
$$;
revoke all on function public.is_org_team(uuid) from public, anon;
grant execute on function public.is_org_team(uuid) to authenticated;

-- Money and connections: managers only (sales can't see invoices, payments, integration settings or sync history)
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists integrations_select on public.integrations;
create policy integrations_select on public.integrations for select to authenticated using (public.is_org_staff(organisation_id));
drop policy if exists integrations_update on public.integrations;
create policy integrations_update on public.integrations for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists integration_sync_logs_select on public.integration_sync_logs;
create policy integration_sync_logs_select on public.integration_sync_logs for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists import_candidates_select on public.import_candidates;
create policy import_candidates_select on public.import_candidates for select to authenticated using (public.is_org_manager(organisation_id));
drop policy if exists import_candidates_update on public.import_candidates;
create policy import_candidates_update on public.import_candidates for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));
drop policy if exists automation_rules_insert on public.automation_rules;
create policy automation_rules_insert on public.automation_rules for insert to authenticated with check (public.is_org_manager(organisation_id));
drop policy if exists automation_rules_update on public.automation_rules;
create policy automation_rules_update on public.automation_rules for update to authenticated using (public.is_org_manager(organisation_id)) with check (public.is_org_manager(organisation_id));

-- Field staff still get their own notifications
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using ((public.is_org_staff(organisation_id) and (user_id is null or user_id = auth.uid())) or (public.is_org_team(organisation_id) and user_id = auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using ((public.is_org_staff(organisation_id) and (user_id is null or user_id = auth.uid())) or (public.is_org_team(organisation_id) and user_id = auth.uid()))
  with check ((public.is_org_staff(organisation_id) and (user_id is null or user_id = auth.uid())) or (public.is_org_team(organisation_id) and user_id = auth.uid()));

-- Team list is visible to the whole team (names for rosters)
drop policy if exists org_users_select on public.organisation_users;
create policy org_users_select on public.organisation_users for select to authenticated
  using (user_id = auth.uid() or public.is_org_team(organisation_id) or public.is_super_admin());

-- Invitations can be for Sales too
alter table public.organisation_invitations drop constraint if exists organisation_invitations_role_check;
alter table public.organisation_invitations add constraint organisation_invitations_role_check check (role in ('admin','manager','sales','staff'));

-- New website enquiries are assigned to office people only
do $$
declare d text;
begin
  select pg_get_functiondef('public.capture_website_enquiry'::regproc) into d;
  if position($q$ou.role in ('owner','admin','manager','staff')$q$ in d) > 0 then
    execute replace(d, $q$ou.role in ('owner','admin','manager','staff')$q$, $q$ou.role in ('owner','admin','manager','sales')$q$);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Team defaults
-- ---------------------------------------------------------------------
alter table public.organisation_users add column if not exists auto_add_to_events boolean not null default false;  -- e.g. whoever does the rosters
alter table public.organisation_users add column if not exists sees_job_details boolean not null default false;    -- inclusions (hours, coffees, catering) — never prices

-- ---------------------------------------------------------------------
-- Who is working each event
-- ---------------------------------------------------------------------
create table public.event_staff (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_id        uuid not null,
  user_id         uuid not null references public.users(id) on delete cascade,
  role            text,                       -- e.g. Barista, Rosters
  sees_details    boolean,                    -- null = use the person's default
  auto_added      boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id) default auth.uid(),
  unique (event_id, user_id),
  foreign key (event_id, organisation_id) references public.events(id, organisation_id) on delete cascade
);
create index event_staff_user_idx on public.event_staff (organisation_id, user_id);
alter table public.event_staff enable row level security;
create policy event_staff_select on public.event_staff for select to authenticated
  using (public.is_org_staff(organisation_id) or (user_id = auth.uid() and public.is_org_team(organisation_id)));
create policy event_staff_insert on public.event_staff for insert to authenticated with check (public.is_org_staff(organisation_id));
create policy event_staff_update on public.event_staff for update to authenticated using (public.is_org_staff(organisation_id)) with check (public.is_org_staff(organisation_id));
create policy event_staff_delete on public.event_staff for delete to authenticated using (public.is_org_staff(organisation_id));

-- New events automatically get the "add to every event" people
create or replace function public.event_add_default_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_staff (organisation_id, event_id, user_id, auto_added, created_by)
  select new.organisation_id, new.id, ou.user_id, true, null
  from public.organisation_users ou
  where ou.organisation_id = new.organisation_id and ou.status = 'active' and ou.auto_add_to_events
    and ou.role <> 'customer' and (ou.expires_at is null or ou.expires_at > now())
  on conflict (event_id, user_id) do nothing;
  return new;
end $$;
revoke all on function public.event_add_default_staff() from public, anon, authenticated;
drop trigger if exists events_default_staff on public.events;
create trigger events_default_staff after insert on public.events for each row execute function public.event_add_default_staff();

-- ---------------------------------------------------------------------
-- What a field staff member sees: their jobs, without any money.
-- Details (what's included) only when allowed for them or for that job.
-- ---------------------------------------------------------------------
create or replace function public.my_jobs(p_org uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_default boolean; v jsonb;
begin
  if v_uid is null or not public.is_org_team(p_org) then raise exception 'Not allowed'; end if;
  select sees_job_details into v_default from public.organisation_users where organisation_id = p_org and user_id = v_uid;
  select coalesce(jsonb_agg(j order by (j->>'event_date') nulls last, j->>'start_time'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', e.id, 'number', e.number, 'name', e.name, 'event_date', e.event_date, 'start_time', e.start_time, 'finish_time', e.finish_time,
      'venue', e.venue, 'event_type', e.event_type, 'guest_count', e.guest_count, 'status', e.status,
      'client', c.name,
      'my_role', es.role,
      'onsite_contact', (select jsonb_build_object('name', trim(k.first_name || ' ' || coalesce(k.last_name, '')), 'phone', k.phone)
                         from public.contacts k where k.id = e.primary_contact_id),
      'team', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(u.full_name, u.email), 'role', s2.role) order by u.full_name), '[]'::jsonb)
               from public.event_staff s2 join public.users u on u.id = s2.user_id where s2.event_id = e.id),
      'details_allowed', coalesce(es.sees_details, v_default, false),
      'inclusions', case when coalesce(es.sees_details, v_default, false) then (
          select coalesce(jsonb_agg(jsonb_build_object('section', qs.title, 'name', qi.name, 'description', qi.description,
                                                       'quantity', qi.quantity, 'unit', qi.unit, 'optional', qi.is_optional or coalesce(qs.is_optional, false))
                                    order by qs.position, qi.position), '[]'::jsonb)
          from public.quote_items qi left join public.quote_sections qs on qs.id = qi.section_id
          where qi.quote_id = (select q.id from public.quotes q where q.event_id = e.id and q.status <> 'declined'
                               order by (q.status = 'accepted') desc, q.created_at desc limit 1)
            and qi.name <> '') else null end
    ) j
    from public.event_staff es
    join public.events e on e.id = es.event_id
    left join public.customers c on c.id = e.customer_id
    where es.organisation_id = p_org and es.user_id = v_uid and e.status <> 'cancelled'
      and (p_from is null or e.event_date >= p_from) and (p_to is null or e.event_date <= p_to)
  ) x;
  return v;
end $$;
revoke all on function public.my_jobs(uuid, date, date) from public, anon;
grant execute on function public.my_jobs(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Roster defaults can be set before someone accepts their invitation
-- ---------------------------------------------------------------------
alter table public.organisation_invitations add column if not exists auto_add_to_events boolean not null default false;
alter table public.organisation_invitations add column if not exists sees_job_details boolean not null default false;
drop policy if exists invitations_update on public.organisation_invitations;
create policy invitations_update on public.organisation_invitations for update to authenticated
  using (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organisation_id, array['owner','admin']::public.org_role[]));
create or replace function public.invitation_copy_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.accepted_at is not null and old.accepted_at is null and new.accepted_by is not null then
    update public.organisation_users set auto_add_to_events = new.auto_add_to_events, sees_job_details = new.sees_job_details
    where organisation_id = new.organisation_id and user_id = new.accepted_by;
  end if;
  return new;
end $$;
revoke all on function public.invitation_copy_defaults() from public, anon, authenticated;
drop trigger if exists invitations_copy_defaults on public.organisation_invitations;
create trigger invitations_copy_defaults after update on public.organisation_invitations for each row execute function public.invitation_copy_defaults();
